export const electronIntegrationMethods = {

            // Everything in this method is a no-op in a plain browser tab -
            // window.electronAPI only exists when this page is loaded inside the
            // Electron desktop wrapper (see electron/preload.js). This is the
            // only place the app's normal behavior branches on that; every other
            // function (handleFiles, settings, etc.) is unaware Electron exists
            // at all, so opening this file directly in a browser stays completely
            // unaffected by this integration.
            initializeElectronIntegration() {
                if (!window.electronAPI) {
                    return;
                }

                // main.js queries this (via executeJavaScript) before allowing the
                // window to close, so it can show a real native confirmation dialog
                // instead of relying on beforeunload - which Electron silently
                // honors with no dialog and no feedback, making the window
                // seem unclosable. `let captionGen` isn't a window property in
                // strict mode, so this is exposed explicitly rather than assuming
                // main.js can reach it directly.
                window.hasUnsavedCaptionWork = () => this.hasUnsavedWork();

                // Called from the same close-confirmation flow when the user
                // explicitly chooses "Don't Save" - clears the autosaved
                // snapshot so nothing gets offered for restore on next launch,
                // rather than leaving behind a session they deliberately chose
                // not to keep. Returns the clear's own promise so main.js can
                // await it before actually destroying the window.
                window.discardCaptionSessionForQuit = () => this.clearSessionSnapshot();

                const section = document.getElementById('sendToSection');
                const toggle = document.getElementById('sendToToggle');

                window.electronAPI.sendTo.status().then(({ supported, registered }) => {
                    section.classList.toggle('hidden', !supported);
                    toggle.checked = registered;
                }).catch(error => {
                    console.error('Could not read Send To status:', error);
                });

                toggle.addEventListener('change', async () => {
                    const wantEnabled = toggle.checked;
                    toggle.disabled = true;
                    try {
                        const result = wantEnabled
                            ? await window.electronAPI.sendTo.register()
                            : await window.electronAPI.sendTo.unregister();
                        toggle.checked = result.registered;
                        this.showMessage(
                            result.registered
                                ? 'Send To integration enabled - right-click audio/video files in Explorer to try it.'
                                : 'Send To integration disabled.',
                            'success'
                        );
                    } catch (error) {
                        // Revert the checkbox rather than leaving it showing a
                        // state that didn't actually take effect.
                        toggle.checked = !wantEnabled;
                        this.showMessage(`Could not update Send To integration: ${error.message}`, 'error');
                    } finally {
                        toggle.disabled = false;
                    }
                });

                // Files opened via Send To (or passed on the command line at
                // launch) arrive here as {name, buffer, type, lastModified}
                // objects, not real File objects - reconstruct real ones and
                // hand them to the exact same entry point drag-and-drop and the
                // file picker already use, so every existing dedup/incremental-
                // processing rule applies identically regardless of how a file
                // arrived.
                window.electronAPI.onFilesOpened((payload) => {
                    const files = payload.map(({ name, buffer, type, lastModified }) =>
                        new File([new Uint8Array(buffer)], name, { type, lastModified })
                    );
                    if (files.length > 0) {
                        this.handleFiles(files);
                    }
                });
            }
};
