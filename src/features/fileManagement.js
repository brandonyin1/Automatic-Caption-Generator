export const fileManagementMethods = {

            handleFiles(files) {
                const audioFiles = files.filter(file =>
                    file.type.startsWith('audio/') || file.type.startsWith('video/')
                );

                if (audioFiles.length === 0) {
                    this.showMessage('Please select audio or video files.', 'error');
                    return;
                }

                // A same-named file isn't necessarily the same file - re-exporting
                // a video (different size/modified date, same filename) previously
                // just got silently discarded as a "duplicate", leaving stale
                // captions attached to audio that no longer matches. Same name +
                // same size + same last-modified is treated as a true duplicate;
                // same name with either differing is treated as an updated version
                // and replaces the old entry in place, clearing its cached work so
                // it's picked up as needing (re)processing.
                const newFiles = [];
                let replacedCount = 0;
                let exactDuplicateCount = 0;
                let restoredMismatchCount = 0;
                const replacedCurrentFile = { value: false };
                const currentFileNameBefore = this.files[this.currentFileIndex]?.name;

                audioFiles.forEach(file => {
                    const existingIndex = this.files.findIndex(f => f.name === file.name);
                    if (existingIndex !== -1) {
                        const existing = this.files[existingIndex];
                        if (existing.size === file.size && existing.lastModified === file.lastModified) {
                            exactDuplicateCount++;
                            return;
                        }
                        this.files[existingIndex] = file;
                        this.clearCachedFileData(existing.name);
                        replacedCount++;
                        if (existing.name === currentFileNameBefore) {
                            replacedCurrentFile.value = true;
                        }
                        return;
                    }

                    // No live File currently held under this name, but there may
                    // be cached captions for it from a restored session (see
                    // restoreSession/fileMetaCache) - if the file being added now
                    // doesn't match the size of whichever file originally produced
                    // those captions, they're for different content and shouldn't
                    // be silently reused. Deliberately size-only here, not also
                    // lastModified like the replace-in-place check above -
                    // lastModified is well known to shift on files that live in a
                    // synced folder (OneDrive, etc.) even when the content hasn't
                    // changed at all, and the whole point of a restore is to
                    // reunite with the exact same file after some time has
                    // passed, so treating that as a mismatch defeats the feature.
                    // Size is a far more reliable signal that content actually
                    // changed.
                    const cachedMeta = this.fileMetaCache.get(file.name);
                    if (cachedMeta && this.transcripts.has(file.name) && cachedMeta.size !== file.size) {
                        this.clearCachedFileData(file.name);
                        restoredMismatchCount++;
                    }

                    // this.audioUrls is otherwise only ever populated inside
                    // processFiles() right after a successful transcription -
                    // a restored file never goes through that (it already has
                    // captions, so Generate skips it), so without this,
                    // loadCurrentFile() would treat it as a failed file
                    // (missing audioUrl) even though its captions are fully
                    // intact and correct.
                    if (this.transcripts.has(file.name) && !this.audioUrls.has(file.name)) {
                        this.audioUrls.set(file.name, URL.createObjectURL(file));
                    }

                    newFiles.push(file);
                });

                if (newFiles.length === 0 && replacedCount === 0) {
                    this.showMessage('All selected files are already in the list.', 'warning');
                    return;
                }

                const summaryParts = [];
                if (newFiles.length > 0) {
                    summaryParts.push(`${newFiles.length} new file(s) added`);
                }
                if (replacedCount > 0) {
                    summaryParts.push(`${replacedCount} file(s) updated (same name, different content - previous captions cleared)`);
                }
                if (restoredMismatchCount > 0) {
                    summaryParts.push(`${restoredMismatchCount} file(s) didn't match their restored session's captions (different size/date) - cleared, will need to be (re)generated`);
                }
                if (exactDuplicateCount > 0) {
                    summaryParts.push(`${exactDuplicateCount} exact duplicate(s) skipped`);
                }
                this.showMessage(summaryParts.join('; ') + '.', 'info');

                // Remember which file is currently being viewed by name, not
                // index - the sort below can reorder the array, and a raw index
                // left pointing at the old position would silently end up
                // referring to a different file (or the new one just added).
                const currentFileName = currentFileNameBefore;

                // Add new files to existing array
                this.files.push(...newFiles);

                // Natural sorting for proper file order
                this.files.sort((a, b) => {
                    return a.name.localeCompare(b.name, undefined, {
                        numeric: true,
                        sensitivity: 'base'
                    });
                });

                if (currentFileName) {
                    const newIndex = this.files.findIndex(f => f.name === currentFileName);
                    if (newIndex !== -1) {
                        this.currentFileIndex = newIndex;
                    }
                }

                this.displayFiles();

                const results = document.getElementById('results');
                if (replacedCurrentFile.value && results && results.style.display === 'block') {
                    this.setupFileTabs();
                    this.loadCurrentFile();
                    this.updateQualitySummaryForCurrentFile();
                } else if (results && results.style.display !== 'block') {
                    // The current file may already have cached captions - most
                    // notably, re-adding a file after a session restore, which
                    // populates this.transcripts directly without ever going
                    // through processFiles(). Reveal them immediately rather
                    // than making the user also click Generate to see data
                    // that's already fully there.
                    const currentFile = this.files[this.currentFileIndex];
                    if (currentFile && this.transcripts.has(currentFile.name)) {
                        this.showResults();
                        this.showQualitySummary();
                    }
                }

                this.updateProcessButton();
            },


            // Drops every cached artifact tied to a filename - transcript,
            // captions, quality data, undo history, scroll position, and any
            // blob URL - so the name is treated as fully "unprocessed" again.
            // Shared by removeFile() (force a re-transcribe by remove+re-add)
            // and handleFiles() (same filename, different file content).
            clearCachedFileData(fileName) {
                this.transcripts.delete(fileName);
                this.qualityData.delete(fileName);
                this.processingTimes.delete(fileName);
                this.whisperResults.delete(fileName);
                this.undoStacks.delete(fileName);
                this.fileScrollPositions.delete(fileName);
                this.fileMetaCache.delete(fileName);
                const audioUrl = this.audioUrls.get(fileName);
                if (audioUrl) {
                    URL.revokeObjectURL(audioUrl);
                }
                this.audioUrls.delete(fileName);
            },


            isVideoFile(file) {
                // Check if file is a video type that we should extract audio from
                const videoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
                return videoTypes.includes(file.type) || 
                       (file.type === '' && /\.(mp4|mov|avi|webm)$/i.test(file.name));
            },


            displayFiles() {
                const fileList = document.getElementById('fileList');
                const fileContainer = document.getElementById('fileContainer');
                
                fileContainer.innerHTML = '';
                
                this.files.forEach((file, index) => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    
                    const isVideo = this.isVideoFile(file);
                    const icon = isVideo ? '🎬' : '🎵';
                    const typeLabel = isVideo ? 'Video (audio will be extracted)' : 'Audio';
                    
                    fileItem.innerHTML = `
                        <div class="file-info">
                            <div class="file-icon">${icon}</div>
                            <div class="file-details">
                                <h4>${this.escapeHtml(file.name)}</h4>
                                <p>${(file.size / 1024 / 1024).toFixed(2)} MB • ${typeLabel}</p>
                            </div>
                        </div>
                        <button class="remove-btn" onclick="captionGen.removeFile(${index})">Remove</button>
                    `;
                    fileContainer.appendChild(fileItem);
                });

                fileList.style.display = 'block';
            },


            removeFile(index) {
                const file = this.files[index];
                this.files.splice(index, 1);

                // Also drop any cached work for this file, so removing and
                // re-adding it is a genuine way to force a full re-transcription -
                // otherwise processFiles() would just see this.transcripts still
                // has an entry for it and skip it again even after being re-added.
                if (file) {
                    this.clearCachedFileData(file.name);
                }

                // Keep currentFileIndex valid and pointing at the same file it
                // was before (shifted down if something earlier in the list was
                // removed), or clamped to a neighboring file if the removed one
                // *was* the current file - left stale/out-of-bounds, the next
                // loadCurrentFile() call (switching tabs, hitting Generate again)
                // would throw trying to read a file that no longer exists there.
                if (index < this.currentFileIndex) {
                    this.currentFileIndex--;
                }
                this.currentFileIndex = Math.max(0, Math.min(this.currentFileIndex, this.files.length - 1));

                const results = document.getElementById('results');

                if (this.files.length === 0) {
                    document.getElementById('fileList').style.display = 'none';
                    if (results) {
                        results.style.display = 'none';
                    }
                } else {
                    this.displayFiles();
                    // If results are already showing, keep them in sync with the
                    // file list - otherwise they'd keep showing a removed file's
                    // captions (or silently the wrong file's) with no indication
                    // anything changed.
                    if (results && results.style.display === 'block') {
                        this.setupFileTabs();
                        this.loadCurrentFile();
                        this.updateQualitySummaryForCurrentFile();
                    }
                }
                this.updateProcessButton();
            },


            switchToFile(index) {
                // Remember where we're leaving off in the outgoing file before
                // switching - loadCurrentFile() restores it (or defaults to the
                // top) when this file is switched back to.
                const previousFile = this.files[this.currentFileIndex];
                const transcriptEditor = document.getElementById('transcriptEditor');
                if (previousFile && transcriptEditor) {
                    this.fileScrollPositions.set(previousFile.name, transcriptEditor.scrollTop);
                }

                this.currentFileIndex = index;

                document.querySelectorAll('.tab-btn').forEach((tab, i) => {
                    tab.classList.toggle('active', i === index);
                });

                this.loadCurrentFile();
                this.updateQualitySummaryForCurrentFile();
            },


            setupFileTabs() {
                const fileTabs = document.getElementById('fileTabs');
                fileTabs.innerHTML = '';

                this.files.forEach((file, index) => {
                    const tab = document.createElement('button');
                    const hasTranscript = this.transcripts.has(file.name);
                    
                    tab.className = `tab-btn ${index === this.currentFileIndex ? 'active' : ''}`;
                    
                    // Add visual indicator for failed files
                    if (!hasTranscript) {
                        tab.style.backgroundColor = '#f8d7da';
                        tab.style.borderColor = '#f5c6cb';
                        tab.style.color = '#721c24';
                        tab.textContent = `❌ ${file.name.replace(/\.[^/.]+$/, '')}`;
                        tab.title = `This file failed to process - click to see error details`;
                    } else {
                        tab.textContent = file.name.replace(/\.[^/.]+$/, '');
                        tab.title = `Successfully processed - ${this.transcripts.get(file.name).length} captions`;
                    }
                    
                    tab.addEventListener('click', () => this.switchToFile(index));
                    fileTabs.appendChild(tab);
                });
            },


            loadCurrentFile() {
                const currentFile = this.files[this.currentFileIndex];
                const captions = this.transcripts.get(currentFile.name);
                const audioUrl = this.audioUrls.get(currentFile.name);

                // Regenerating needs a cached transcript for this file, whether or
                // not caption generation itself ultimately succeeded.
                const regenerateBtn = document.getElementById('regenerateCaptions');
                if (regenerateBtn) {
                    regenerateBtn.disabled = !this.whisperResults.has(currentFile.name);
                }
                this.updateUndoButtonState();

                // Check if this file was processed successfully
                if (!captions || !audioUrl) {
                    // Show error state for failed files
                    const audioPlayer = document.getElementById('audioPlayer');
                    audioPlayer.src = '';

                    const transcriptEditor = document.getElementById('transcriptEditor');
                    transcriptEditor.textContent = `❌ ERROR: This file failed to process.\n\nFile: ${currentFile.name}\n\nCheck the processing logs above for details about what went wrong.\n\nPossible issues:\n• File format not supported\n• Audio too short or silent\n• API request failed\n• Transcription returned empty`;

                    this.currentCaptions = [];

                    return;
                }

                // Load audio - skip reassigning .src when it's already correct.
                // loadCurrentFile() gets called again after in-place edits (merge/
                // split/delete/regenerate) to rebuild the caption cards; setting
                // .src unconditionally would reload the element and reset playback
                // to 0 even though the audio itself hasn't changed.
                const audioPlayer = document.getElementById('audioPlayer');
                if (audioPlayer.src !== audioUrl) {
                    audioPlayer.src = audioUrl;
                    audioPlayer.playbackRate = this.playbackRate;
                }

                // Load captions in read-only viewer
                const transcriptEditor =
                document.getElementById("transcriptEditor");

                transcriptEditor.innerHTML="";

                this.captionCards = [];
                // The old index is meaningless against a freshly-rebuilt card
                // array (different file, or the same file with a different
                // caption count after merge/split/insert/delete/undo/regenerate) -
                // leaving it stale meant setActiveCaption could later try to
                // clear the "active" class off an index past the end of the new
                // array, throw, and silently break caption highlighting for the
                // rest of the session (the throw happened before
                // this.activeCaptionIndex ever got reassigned, so it stayed
                // stuck and kept throwing on every subsequent timeupdate tick).
                this.activeCaptionIndex = -1;
                const settings = this.getCaptionSettings();
                const quality = this.qualityData.get(currentFile.name);
                const issueContext = { mismatchCaptionIndex: quality?.textMatched?.mismatchCaptionIndex ?? null };
                captions.forEach((caption,index)=>{

                    const card=document.createElement("div");

                    card.className="caption-card";

                    card.dataset.index=index;

                    card.innerHTML=`

                <div class="caption-header">

                <span class="time-range">
                    <input type="text" class="time-input" data-role="start" value="${this.formatTime(caption.start)}" aria-label="Start time">
                    <span class="time-sep">–</span>
                    <input type="text" class="time-input" data-role="end" value="${this.formatTime(caption.end)}" aria-label="End time">
                </span>

                <span class="caption-stats"></span>

                </div>

               <div class="caption-body">

                <div
                    class="caption-text"
                    contenteditable="true"
                    spellcheck="${this.spellcheckEnabled ? 'true' : 'false'}">${this.escapeHtml(caption.text)}</div>

                </div>

                <div class="card-actions">
                    <button type="button" class="card-action-btn" data-action="merge">🔗 Merge next</button>
                    <button type="button" class="card-action-btn" data-action="split">✂️ Split</button>
                    <button type="button" class="card-action-btn" data-action="insert">➕ Insert after</button>
                    <button type="button" class="card-action-btn" data-action="delete">🗑️ Delete</button>
                </div>

                `;

                    transcriptEditor.appendChild(card);

                    this.captionCards.push(card);

                    this.updateIssueBadge(card, caption, settings, issueContext);
                    this.updateCaptionStats(card, caption, settings);

                    const textEl = card.querySelector(".caption-text");

                    // Auto-save: caption is the same object reference stored in
                    // this.transcripts, so this keeps all downloads in sync with
                    // zero extra steps. Re-evaluating on every edit keeps the
                    // warning badge live as text length changes (note: matchConfidence
                    // and mismatchCaptionIndex reflect the originally generated text,
                    // not the edit itself).
                    textEl.addEventListener("input", () => {
                        caption.text = textEl.innerText.trim();
                        this.updateIssueBadge(card, caption, settings, issueContext);
                        this.updateCaptionStats(card, caption, settings);
                    });

                    // Structural edits (merge/split/insert/delete/regenerate/time
                    // edits) already push an undo snapshot; plain text edits never
                    // did, even though they auto-save on every keystroke. Capture
                    // the text when editing starts, and if it actually changed by
                    // the time focus leaves, push one snapshot for the whole edit
                    // (not per-keystroke, which would flood the undo stack with
                    // near-duplicates and evict real structural undos sooner).
                    textEl.addEventListener("focus", () => {
                        textEl.dataset.textAtFocus = caption.text;
                    });
                    textEl.addEventListener("blur", () => {
                        const before = textEl.dataset.textAtFocus;
                        if (typeof before === 'string' && before !== caption.text) {
                            const preEditCaptions = captions.map((c, i) => i === index ? { ...c, text: before } : c);
                            this.pushUndoSnapshot(currentFile.name, preEditCaptions);
                            this.saveSessionSnapshot();
                        }
                    });

                    card.addEventListener("click", e => {

                        if(e.target.closest(".caption-text") || e.target.closest(".time-input"))
                            return;

                        const audio=document.getElementById("audioPlayer");

                        // Bounded preview: play only this caption's span, then pause
                        // automatically (handled by the timeupdate listener). Clicking
                        // a different card just overwrites this with the new range;
                        // pressing the native play button clears it (see the 'play'
                        // listener) so playback continues normally from there.
                        this.captionPreviewEndTime = caption.end;
                        this.captionPreviewPending = true;

                        audio.currentTime=caption.start;

                        audio.play();

                    });

                    const mergeBtn = card.querySelector('[data-action="merge"]');
                    const splitBtn = card.querySelector('[data-action="split"]');
                    const insertBtn = card.querySelector('[data-action="insert"]');
                    const deleteBtn = card.querySelector('[data-action="delete"]');

                    if (index === captions.length - 1) {
                        mergeBtn.disabled = true;
                        mergeBtn.title = 'No next caption to merge with';
                    }

                    mergeBtn.addEventListener("click", e => {
                        e.stopPropagation();
                        this.mergeCaptionWithNext(currentFile.name, index);
                    });

                    // preventDefault on mousedown keeps the text selection/caret in
                    // textEl intact - otherwise clicking the button steals focus
                    // before the click handler can read where the cursor was.
                    splitBtn.addEventListener("mousedown", e => e.preventDefault());
                    splitBtn.addEventListener("click", e => {
                        e.stopPropagation();
                        this.splitCaptionAtCursor(currentFile.name, index, textEl);
                    });

                    insertBtn.addEventListener("click", e => {
                        e.stopPropagation();
                        this.insertCaptionAfter(currentFile.name, index);
                    });

                    deleteBtn.addEventListener("click", e => {
                        e.stopPropagation();
                        this.deleteCaption(currentFile.name, index);
                    });

                    const startInput = card.querySelector('.time-input[data-role="start"]');
                    const endInput = card.querySelector('.time-input[data-role="end"]');

                    [startInput, endInput].forEach(input => {
                        input.addEventListener("click", e => e.stopPropagation());

                        input.addEventListener("keydown", e => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                input.blur();
                            }
                        });

                        input.addEventListener("blur", () => {
                            this.commitCaptionTimeEdit(currentFile.name, index, input.dataset.role, input, card);
                        });
                    });

                });
                // Store current captions for sync
                this.currentCaptions = captions;

                // Restore wherever this file was scrolled to last time it was
                // viewed (switchToFile captures it on the way out), defaulting to
                // the top for a file with no remembered position yet. Callers
                // that need to preserve the *current* file's exact scroll
                // position across an in-place edit (refreshFileState) capture and
                // restore it themselves around this call, which simply overrides
                // whatever this sets - so this only actually matters when the
                // file being displayed just changed.
                transcriptEditor.scrollTop = this.fileScrollPositions.get(currentFile.name) || 0;
            },


            // Re-runs Phase 2/3 (GPT segmentation + timing alignment) for the current
            // file against its cached Whisper transcript, picking up whatever caption
            // settings are set right now - without paying for Whisper again. Useful
            // for iterating on max/target characters, reading speed, etc.
            async regenerateCurrentFileCaptions() {
                const currentFile = this.files[this.currentFileIndex];
                const whisperResult = this.whisperResults.get(currentFile.name);

                if (!whisperResult) {
                    this.showMessage('No cached transcription available for this file - process it first.', 'error');
                    return;
                }

                const btn = document.getElementById('regenerateCaptions');
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.textContent = '🔁 Regenerating...';

                try {
                    this.logMessage(`\n🔁 Regenerating captions for ${currentFile.name} using current settings (no re-transcription)...`, 'plain');

                    const professionalCaptions = await this.generateProfessionalCaptions(whisperResult, currentFile.name);

                    if (!professionalCaptions || professionalCaptions.length === 0) {
                        throw new Error('No captions were generated');
                    }

                    const previousCaptions = this.transcripts.get(currentFile.name);
                    if (previousCaptions) {
                        this.pushUndoSnapshot(currentFile.name, previousCaptions);
                    }

                    this.transcripts.set(currentFile.name, professionalCaptions);
                    this.refreshFileState(currentFile.name, professionalCaptions);

                    this.logMessage(`✅ Regenerated ${professionalCaptions.length} captions for ${currentFile.name}`, 'plain');
                    this.showMessage(`✅ Captions regenerated for ${currentFile.name}.`, 'success');
                } catch (error) {
                    console.error('Error regenerating captions:', error);
                    this.logMessage(`❌ Failed to regenerate captions for ${currentFile.name}: ${error.message}`, 'error');
                    this.showMessage(`❌ Failed to regenerate captions: ${error.message}`, 'error');
                } finally {
                    btn.disabled = !this.whisperResults.has(currentFile.name);
                    btn.textContent = originalText;
                }
            }
};
