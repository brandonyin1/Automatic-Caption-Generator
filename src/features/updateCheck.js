export const updateCheckMethods = {

            // Only meaningful for the plain browser build - the Electron wrapper
            // has its own native updater (electron-updater, wired up in
            // electron/main.js) that already covers this, and running both would
            // mean two separate "a new version is available" notices for the same
            // event. window.electronAPI only exists inside that wrapper (see
            // electronIntegration.js), so this is skipped there entirely.
            async checkForUpdates() {
                if (window.electronAPI) {
                    return;
                }
                if (!this.updateCheckEnabled) {
                    return;
                }

                try {
                    // At most once per day per browser - a page left open and
                    // reloaded repeatedly shouldn't hammer GitHub's unauthenticated
                    // API rate limit (60 requests/hour/IP) just for a version check.
                    // Reading localStorage itself can throw (private browsing,
                    // storage disabled by policy), so this whole sequence - not
                    // just the fetch - needs to be inside the catch below.
                    const lastChecked = Number(localStorage.getItem(this.UPDATE_LAST_CHECKED_STORAGE_KEY) || 0);
                    if (Date.now() - lastChecked < 24 * 60 * 60 * 1000) {
                        return;
                    }

                    localStorage.setItem(this.UPDATE_LAST_CHECKED_STORAGE_KEY, String(Date.now()));

                    const response = await fetch('https://api.github.com/repos/brandonyin1/Automatic-Caption-Generator/releases/latest');
                    if (!response.ok) {
                        return;
                    }
                    const release = await response.json();
                    const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
                    if (!latestVersion || !this.isNewerVersion(latestVersion, this.APP_VERSION)) {
                        return;
                    }

                    // Once dismissed, stays dismissed for that specific version -
                    // but a version newer still than the dismissed one shows again.
                    const dismissedVersion = localStorage.getItem(this.UPDATE_DISMISSED_VERSION_STORAGE_KEY);
                    if (dismissedVersion && !this.isNewerVersion(latestVersion, dismissedVersion)) {
                        return;
                    }

                    this.showUpdateBanner(latestVersion, release.html_url);
                } catch (error) {
                    // Offline, corporate proxy blocking github.com, rate-limited,
                    // no releases yet, malformed response - none of these should
                    // ever surface to the user or block anything else on load.
                    console.error('Update check failed (non-fatal):', error);
                }
            },

            // Numeric major.minor.patch comparison - good enough for this repo's
            // tags (vX.Y.Z) without pulling in a semver library for one comparison.
            isNewerVersion(candidate, current) {
                const c = candidate.split('.').map(Number);
                const b = current.split('.').map(Number);
                for (let i = 0; i < Math.max(c.length, b.length); i++) {
                    const cPart = c[i] || 0;
                    const bPart = b[i] || 0;
                    if (cPart !== bPart) {
                        return cPart > bPart;
                    }
                }
                return false;
            },

            showUpdateBanner(latestVersion, releaseUrl) {
                const banner = document.getElementById('updateAvailableBanner');
                const message = document.getElementById('updateAvailableMessage');
                const link = document.getElementById('updateDownloadLink');
                if (!banner || !message || !link) return;

                message.textContent = `Version ${latestVersion} is available (you're on ${this.APP_VERSION}).`;
                link.href = releaseUrl || 'https://github.com/brandonyin1/Automatic-Caption-Generator/releases/latest';
                banner.dataset.latestVersion = latestVersion;
                banner.classList.remove('hidden');
            },

            dismissUpdateBanner() {
                const banner = document.getElementById('updateAvailableBanner');
                if (!banner) return;
                if (banner.dataset.latestVersion) {
                    try {
                        localStorage.setItem(this.UPDATE_DISMISSED_VERSION_STORAGE_KEY, banner.dataset.latestVersion);
                    } catch (error) {
                        console.error('Could not save dismissed update version:', error);
                    }
                }
                banner.classList.add('hidden');
            },

            loadUpdateCheckPreference() {
                const toggle = document.getElementById('updateCheckToggle');
                const versionDisplay = document.getElementById('currentVersionDisplay');
                const versionDisplayElectron = document.getElementById('currentVersionDisplayElectron');
                if (versionDisplay) versionDisplay.textContent = this.APP_VERSION;
                if (versionDisplayElectron) versionDisplayElectron.textContent = this.APP_VERSION;

                // The Electron wrapper updates itself automatically via
                // electron-updater (main.js) - there's no per-user toggle for
                // it, so swap in a version-only note instead of the
                // browser-build's toggle, rather than hiding the section entirely.
                if (window.electronAPI) {
                    const toggleLabel = document.getElementById('updateCheckToggleLabel');
                    const helpBrowser = document.getElementById('updateCheckHelpBrowser');
                    const helpElectron = document.getElementById('updateCheckHelpElectron');
                    if (toggleLabel) toggleLabel.classList.add('hidden');
                    if (helpBrowser) helpBrowser.classList.add('hidden');
                    if (helpElectron) helpElectron.classList.remove('hidden');
                    return;
                }

                let enabled = true;
                try {
                    const stored = localStorage.getItem(this.UPDATE_CHECK_ENABLED_STORAGE_KEY);
                    if (stored !== null) {
                        enabled = stored === 'true';
                    }
                } catch (error) {
                    console.error('Could not load update-check preference:', error);
                }

                this.updateCheckEnabled = enabled;
                if (toggle) toggle.checked = enabled;
            }
};
