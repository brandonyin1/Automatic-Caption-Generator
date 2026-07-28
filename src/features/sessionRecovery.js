export const sessionRecoveryMethods = {

            // Minimal IndexedDB wrapper, covering two things: the two
            // save-location directory handles (FileSystemDirectoryHandle objects
            // are structured-cloneable, so unlike localStorage - strings only -
            // IndexedDB can hold them directly), and a periodic snapshot of
            // in-progress caption work for crash/reload recovery (see
            // saveSessionSnapshot). Scoped to this exact file:// path - reopening
            // the app from a different copy or location won't see these, since
            // that's a different storage origin.
            openAppDB() {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open('captionGeneratorHandles', 2);
                    request.onupgradeneeded = () => {
                        const db = request.result;
                        if (!db.objectStoreNames.contains('handles')) {
                            db.createObjectStore('handles');
                        }
                        if (!db.objectStoreNames.contains('session')) {
                            db.createObjectStore('session');
                        }
                    };
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            },


            async saveStoredHandle(key, handle) {
                try {
                    const db = await this.openAppDB();
                    await new Promise((resolve, reject) => {
                        const tx = db.transaction('handles', 'readwrite');
                        tx.objectStore('handles').put(handle, key);
                        tx.oncomplete = resolve;
                        tx.onerror = () => reject(tx.error);
                    });
                    db.close();
                } catch (error) {
                    console.error(`Could not remember the ${key} save location:`, error);
                }
            },


            async loadStoredHandle(key) {
                try {
                    const db = await this.openAppDB();
                    const handle = await new Promise((resolve, reject) => {
                        const tx = db.transaction('handles', 'readonly');
                        const req = tx.objectStore('handles').get(key);
                        req.onsuccess = () => resolve(req.result || null);
                        req.onerror = () => reject(req.error);
                    });
                    db.close();
                    return handle;
                } catch (error) {
                    console.error(`Could not load the remembered ${key} save location:`, error);
                    return null;
                }
            },


            async clearStoredHandle(key) {
                try {
                    const db = await this.openAppDB();
                    await new Promise((resolve, reject) => {
                        const tx = db.transaction('handles', 'readwrite');
                        tx.objectStore('handles').delete(key);
                        tx.oncomplete = resolve;
                        tx.onerror = () => reject(tx.error);
                    });
                    db.close();
                } catch (error) {
                    console.error(`Could not forget the ${key} save location:`, error);
                }
            },


            // Persists caption text/timing plus the cached transcription result
            // (so Regenerate keeps working after a restore) for every processed
            // file, so a crashed tab, accidental reload, or closed browser
            // doesn't lose editing work that was never explicitly downloaded.
            // Deliberately does NOT persist the audio/video files themselves -
            // File objects can technically be structured-cloned into IndexedDB,
            // but doing that for potentially many large media files just for
            // crash recovery is a heavy storage cost for something the user
            // already has a copy of on disk. Restoring re-populates the caption
            // data and asks the user to re-add the matching file(s) by name,
            // which the incremental-processing skip logic (processFiles) then
            // recognizes as already done rather than re-transcribing.
            //
            // Fire-and-forget from every point that changes caption data - text
            // sized data, cheap enough not to need debouncing beyond the natural
            // throttling of those call sites (once per edit action, not per
            // keystroke - text edits autosave to the in-memory array on every
            // keystroke but only trigger this on blur).
            async saveSessionSnapshot() {
                try {
                    if (this.transcripts.size === 0 && this.whisperResults.size === 0) {
                        await this.clearSessionSnapshot();
                        return;
                    }

                    const fileNames = new Set([...this.transcripts.keys(), ...this.whisperResults.keys()]);
                    const files = {};
                    fileNames.forEach(name => {
                        const meta = this.fileMetaCache.get(name) || null;
                        files[name] = {
                            captions: this.transcripts.get(name) || null,
                            whisperResult: this.whisperResults.get(name) || null,
                            fileSize: meta ? meta.size : null,
                            fileLastModified: meta ? meta.lastModified : null
                        };
                    });

                    const snapshot = { savedAt: Date.now(), files };

                    const db = await this.openAppDB();
                    await new Promise((resolve, reject) => {
                        const tx = db.transaction('session', 'readwrite');
                        tx.objectStore('session').put(snapshot, 'current');
                        tx.oncomplete = resolve;
                        tx.onerror = () => reject(tx.error);
                    });
                    db.close();
                } catch (error) {
                    console.error('Could not save session snapshot:', error);
                }
            },


            async loadSessionSnapshot() {
                try {
                    const db = await this.openAppDB();
                    const snapshot = await new Promise((resolve, reject) => {
                        const tx = db.transaction('session', 'readonly');
                        const req = tx.objectStore('session').get('current');
                        req.onsuccess = () => resolve(req.result || null);
                        req.onerror = () => reject(req.error);
                    });
                    db.close();
                    return snapshot;
                } catch (error) {
                    console.error('Could not load session snapshot:', error);
                    return null;
                }
            },


            async clearSessionSnapshot() {
                try {
                    const db = await this.openAppDB();
                    await new Promise((resolve, reject) => {
                        const tx = db.transaction('session', 'readwrite');
                        tx.objectStore('session').delete('current');
                        tx.oncomplete = resolve;
                        tx.onerror = () => reject(tx.error);
                    });
                    db.close();
                } catch (error) {
                    console.error('Could not clear session snapshot:', error);
                }
            },


            // Checks for a recoverable session on load and, if one exists, shows
            // the recovery banner instead of restoring automatically - restoring
            // silently would be surprising if the user actually meant to start
            // fresh (e.g. deliberately closed a tab full of finished, already-
            // downloaded work).
            async checkForRecoverableSession() {
                const snapshot = await this.loadSessionSnapshot();
                if (!snapshot || !snapshot.files || Object.keys(snapshot.files).length === 0) {
                    return;
                }

                this.pendingSessionSnapshot = snapshot;
                const fileNames = Object.keys(snapshot.files);
                const savedDate = new Date(snapshot.savedAt).toLocaleString();
                const banner = document.getElementById('sessionRecoveryBanner');
                const message = document.getElementById('sessionRecoveryMessage');
                if (!banner || !message) return;

                message.textContent = `Recovered caption work from ${savedDate} for: ${fileNames.join(', ')}.`;
                banner.classList.remove('hidden');
            },


            restoreSession() {
                const snapshot = this.pendingSessionSnapshot;
                if (!snapshot) return;

                Object.entries(snapshot.files).forEach(([name, data]) => {
                    if (data.captions) {
                        this.transcripts.set(name, data.captions);
                    }
                    if (data.whisperResult) {
                        this.whisperResults.set(name, data.whisperResult);
                    }
                    if (data.captions && data.whisperResult) {
                        this.generateQualitySummary(name, data.captions, data.whisperResult.text);
                    }
                    if (typeof data.fileSize === 'number' && typeof data.fileLastModified === 'number') {
                        this.fileMetaCache.set(name, { size: data.fileSize, lastModified: data.fileLastModified });
                    }
                });

                const fileNames = Object.keys(snapshot.files);
                this.pendingSessionSnapshot = null;

                // Restoring only repopulates in-memory transcript/caption data -
                // there's no way to reconstruct the original File objects, so
                // nothing else on the page changes yet (no file list, no
                // results) until the same file(s) are re-added. Hiding the
                // banner here and relying on a toast that fades in a few
                // seconds left no trace of what to do next - this looked
                // exactly like "click Restore, nothing happens." Keep the
                // banner up as a persistent reminder instead, with a single
                // dismiss button, until the user explicitly closes it.
                const banner = document.getElementById('sessionRecoveryBanner');
                const message = document.getElementById('sessionRecoveryMessage');
                const actions = banner.querySelector('.session-recovery-actions');
                message.textContent = `Captions restored for: ${fileNames.join(', ')}. Add these same file(s) back (drag-and-drop or the file picker) to continue - they won't be re-transcribed.`;
                actions.innerHTML = '';
                const dismissBtn = document.createElement('button');
                dismissBtn.type = 'button';
                dismissBtn.className = 'settings-reset-btn';
                dismissBtn.textContent = 'Got it';
                dismissBtn.addEventListener('click', () => banner.classList.add('hidden'));
                actions.appendChild(dismissBtn);

                this.showMessage(`Restored captions for ${fileNames.length} file(s).`, 'success');
            },


            discardSession() {
                this.clearSessionSnapshot();
                this.pendingSessionSnapshot = null;
                document.getElementById('sessionRecoveryBanner').classList.add('hidden');
            },


            // On load, re-adopt any remembered directory handles whose permission
            // hasn't been outright denied. 'granted' means it'll just work
            // silently; 'prompt' means the handle is restored into memory and the
            // UI shows its name, but the browser will need to re-confirm write
            // access (via ensureDirectoryPermission, from within a later user
            // click on a download button) before the first write after reopening
            // the page - it can't be silently re-granted without a user gesture.
            async restoreSaveLocations() {
                if (!this.supportsFileSystemAccess) return;
                for (const kind of ['caption', 'debug']) {
                    const handle = await this.loadStoredHandle(kind);
                    if (!handle) continue;
                    try {
                        const permission = await handle.queryPermission({ mode: 'readwrite' });
                        if (permission === 'denied') continue;
                        if (kind === 'debug') {
                            this.debugSaveDirectoryHandle = handle;
                        } else {
                            this.captionSaveDirectoryHandle = handle;
                        }
                        this.updateSaveLocationUI(kind);
                    } catch (error) {
                        console.error(`Could not restore the ${kind} save location:`, error);
                    }
                }
            },


            // Lets the user pick a folder (via the File System Access API, Chromium
            // only) to write exports into directly, instead of the browser's
            // default downloads location. Only offered at all when
            // this.supportsFileSystemAccess is true - the button is hidden
            // otherwise, so this only ever runs where the API exists. kind is
            // 'caption' or 'debug' - captions/transcripts and debug exports can be
            // pointed at different folders.
            async chooseSaveLocation(kind) {
                try {
                    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                    if (kind === 'debug') {
                        this.debugSaveDirectoryHandle = handle;
                    } else {
                        this.captionSaveDirectoryHandle = handle;
                    }
                    this.updateSaveLocationUI(kind);
                    await this.saveStoredHandle(kind, handle);
                    const label = kind === 'debug' ? 'Debug exports' : 'Caption downloads';
                    this.showMessage(`${label} will now save to "${handle.name}".`, 'success');
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error('Could not choose a save folder:', error);
                        this.showMessage('Could not access that folder.', 'error');
                    }
                }
            },


            updateSaveLocationUI(kind) {
                const handle = kind === 'debug' ? this.debugSaveDirectoryHandle : this.captionSaveDirectoryHandle;
                const chooseBtn = document.getElementById(kind === 'debug' ? 'chooseDebugSaveLocationBtn' : 'chooseCaptionSaveLocationBtn');
                const clearBtn = document.getElementById(kind === 'debug' ? 'clearDebugSaveLocationBtn' : 'clearCaptionSaveLocationBtn');
                if (handle) {
                    chooseBtn.textContent = `📁 ${handle.name}`;
                    clearBtn.classList.remove('hidden');
                } else {
                    chooseBtn.textContent = 'Downloads folder (default)';
                    clearBtn.classList.add('hidden');
                }
            },


            // Write permission on a directory handle can be revoked or simply not
            // yet confirmed for this handle - re-check/re-request before each write
            // rather than assuming the grant from showDirectoryPicker() still holds.
            async ensureDirectoryPermission(directoryHandle) {
                const opts = { mode: 'readwrite' };
                let permission = await directoryHandle.queryPermission(opts);
                if (permission !== 'granted') {
                    permission = await directoryHandle.requestPermission(opts);
                }
                return permission;
            }
};
