export const settingsMethods = {

            getTechnicalTerms() {
                return document.getElementById('technicalTerms').value
                    .split('\n')
                    .map(term => term.trim())
                    .filter(term => term.length > 0);
            },


            loadSavedDictionary() {
                try {
                    const saved = localStorage.getItem(this.DICTIONARY_STORAGE_KEY);
                    if (saved !== null) {
                        document.getElementById('technicalTerms').value = saved;
                    }
                } catch (error) {
                    console.error('Could not load saved technical terms dictionary:', error);
                }
            },


            saveDictionary() {
                try {
                    localStorage.setItem(this.DICTIONARY_STORAGE_KEY, document.getElementById('technicalTerms').value);
                } catch (error) {
                    console.error('Could not save technical terms dictionary:', error);
                }
            },


            loadSavedDownloadFormat() {
                try {
                    const saved = localStorage.getItem(this.DOWNLOAD_FORMAT_STORAGE_KEY);
                    if (saved === 'srt' || saved === 'vtt') {
                        document.getElementById('downloadFormat').value = saved;
                    }
                } catch (error) {
                    console.error('Could not load saved download format:', error);
                }
            },


            saveDownloadFormat(format) {
                try {
                    localStorage.setItem(this.DOWNLOAD_FORMAT_STORAGE_KEY, format);
                } catch (error) {
                    console.error('Could not save download format:', error);
                }
            },


            loadSavedApiKey() {
                try {
                    const saved = localStorage.getItem(this.API_KEY_STORAGE_KEY);
                    if (saved) {
                        document.getElementById('apiKey').value = saved;
                    }
                } catch (error) {
                    console.error('Could not load saved API key:', error);
                }
            },


            // Only persists the key when "Remember this key" is checked; otherwise
            // makes sure nothing lingers in storage from a previous session.
            saveApiKey(value) {
                try {
                    const remember = document.getElementById('rememberApiKey').checked;
                    const trimmed = value.trim();
                    if (remember && trimmed) {
                        localStorage.setItem(this.API_KEY_STORAGE_KEY, trimmed);
                    } else {
                        localStorage.removeItem(this.API_KEY_STORAGE_KEY);
                    }
                } catch (error) {
                    console.error('Could not save API key:', error);
                }
            },


            loadSavedElevenlabsApiKey() {
                try {
                    const saved = localStorage.getItem(this.ELEVENLABS_API_KEY_STORAGE_KEY);
                    if (saved) {
                        document.getElementById('elevenlabsApiKey').value = saved;
                    }
                } catch (error) {
                    console.error('Could not load saved ElevenLabs API key:', error);
                }
            },


            saveElevenlabsApiKey(value) {
                try {
                    const remember = document.getElementById('rememberElevenlabsApiKey').checked;
                    const trimmed = value.trim();
                    if (remember && trimmed) {
                        localStorage.setItem(this.ELEVENLABS_API_KEY_STORAGE_KEY, trimmed);
                    } else {
                        localStorage.removeItem(this.ELEVENLABS_API_KEY_STORAGE_KEY);
                    }
                } catch (error) {
                    console.error('Could not save ElevenLabs API key:', error);
                }
            },


            // Transcription provider is deliberately not part of the caption
            // settings JSON blob (CAPTION_SETTINGS_STORAGE_KEY) - unlike everything
            // else in that object, it isn't re-read when regenerating captions from
            // an already-cached transcript, only when transcribing a new file.
            loadTranscriptionProvider() {
                try {
                    const saved = localStorage.getItem(this.TRANSCRIPTION_PROVIDER_STORAGE_KEY);
                    if (saved === 'whisper' || saved === 'elevenlabs') {
                        document.getElementById('settingTranscriptionProvider').value = saved;
                    }
                } catch (error) {
                    console.error('Could not load saved transcription provider:', error);
                }
            },


            saveTranscriptionProvider() {
                try {
                    localStorage.setItem(this.TRANSCRIPTION_PROVIDER_STORAGE_KEY, document.getElementById('settingTranscriptionProvider').value);
                } catch (error) {
                    console.error('Could not save transcription provider:', error);
                }
            },


            loadSavedTheme() {
                // The inline head script already applied the theme to avoid a
                // flash; this just syncs the toggle switch's state to match.
                const theme = document.documentElement.dataset.theme || 'light';
                this.updateThemeToggleIcon(theme);
            },


            toggleTheme() {
                const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
                const next = current === 'dark' ? 'light' : 'dark';
                document.documentElement.dataset.theme = next;
                this.updateThemeToggleIcon(next);
                try {
                    localStorage.setItem(this.THEME_STORAGE_KEY, next);
                } catch (error) {
                    console.error('Could not save theme preference:', error);
                }
            },


            // The sun/moon icons are static; only the sliding thumb (pure CSS, keyed
            // off [data-theme="dark"]) and this accessibility/title state change.
            updateThemeToggleIcon(theme) {
                const toggle = document.getElementById('themeToggle');
                toggle.setAttribute('aria-checked', theme === 'dark' ? 'true' : 'false');
                toggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
            },


            loadCaptionSettings() {
                try {
                    const saved = localStorage.getItem(this.CAPTION_SETTINGS_STORAGE_KEY);
                    if (!saved) return;
                    const parsed = JSON.parse(saved);
                    const idsByKey = {
                        maxChars: 'settingMaxChars',
                        targetChars: 'settingTargetChars',
                        minDuration: 'settingMinDuration',
                        maxDuration: 'settingMaxDuration',
                        maxReadingSpeed: 'settingMaxReadingSpeed',
                        gapThreshold: 'settingGapThreshold',
                        pauseThreshold: 'settingPauseThreshold',
                        leadIn: 'settingLeadIn',
                        hold: 'settingHold'
                    };
                    Object.entries(idsByKey).forEach(([key, id]) => {
                        if (typeof parsed[key] === 'number' && isFinite(parsed[key])) {
                            document.getElementById(id).value = parsed[key];
                        }
                    });
                    if (typeof parsed.segmentationMethod === 'string') {
                        const methodSelect = document.getElementById('settingSegmentationMethod');
                        if ([...methodSelect.options].some(opt => opt.value === parsed.segmentationMethod)) {
                            methodSelect.value = parsed.segmentationMethod;
                        }
                    }
                    if (typeof parsed.customPrompt === 'string' && parsed.customPrompt.trim()) {
                        document.getElementById('settingCustomPrompt').value = parsed.customPrompt;
                    }
                } catch (error) {
                    console.error('Could not load saved caption settings:', error);
                }
            },


            saveCaptionSettings() {
                try {
                    localStorage.setItem(this.CAPTION_SETTINGS_STORAGE_KEY, JSON.stringify(this.getCaptionSettings()));
                } catch (error) {
                    console.error('Could not save caption settings:', error);
                }
            },


            // Reads the current settings straight from the inputs (so generation
            // always uses whatever is on screen, even before a change event has
            // fired), falling back to sane defaults for anything blank or invalid.
            getCaptionSettings() {
                const readNumber = (id, fallback, min, max) => {
                    const el = document.getElementById(id);
                    const value = el ? parseFloat(el.value) : NaN;
                    if (isNaN(value)) return fallback;
                    return Math.min(max, Math.max(min, value));
                };

                const methodSelect = document.getElementById('settingSegmentationMethod');
                const promptEl = document.getElementById('settingCustomPrompt');
                const defaults = this.DEFAULT_CAPTION_SETTINGS;
                return {
                    maxChars: readNumber('settingMaxChars', defaults.maxChars, 10, 200),
                    targetChars: readNumber('settingTargetChars', defaults.targetChars, 10, 200),
                    minDuration: readNumber('settingMinDuration', defaults.minDuration, 0, 10),
                    maxDuration: readNumber('settingMaxDuration', defaults.maxDuration, 1, 20),
                    maxReadingSpeed: readNumber('settingMaxReadingSpeed', defaults.maxReadingSpeed, 5, 60),
                    gapThreshold: readNumber('settingGapThreshold', defaults.gapThreshold, 0, 5),
                    pauseThreshold: readNumber('settingPauseThreshold', defaults.pauseThreshold, 0.1, 5),
                    leadIn: readNumber('settingLeadIn', defaults.leadIn, 0, 1),
                    hold: readNumber('settingHold', defaults.hold, 0, 1),
                    segmentationMethod: methodSelect && methodSelect.value ? methodSelect.value : defaults.segmentationMethod,
                    customPrompt: promptEl && promptEl.value.trim() ? promptEl.value : defaults.customPrompt
                };
            },


            resetCaptionSettings() {
                const defaults = this.DEFAULT_CAPTION_SETTINGS;
                document.getElementById('settingMaxChars').value = defaults.maxChars;
                document.getElementById('settingTargetChars').value = defaults.targetChars;
                document.getElementById('settingMinDuration').value = defaults.minDuration;
                document.getElementById('settingMaxDuration').value = defaults.maxDuration;
                document.getElementById('settingMaxReadingSpeed').value = defaults.maxReadingSpeed;
                document.getElementById('settingGapThreshold').value = defaults.gapThreshold;
                document.getElementById('settingPauseThreshold').value = defaults.pauseThreshold;
                document.getElementById('settingLeadIn').value = defaults.leadIn;
                document.getElementById('settingHold').value = defaults.hold;
                document.getElementById('settingSegmentationMethod').value = defaults.segmentationMethod;
                document.getElementById('settingCustomPrompt').value = defaults.customPrompt;
                document.getElementById('settingTranscriptionProvider').value = 'whisper';
                this.updatePromptEditorVisibility();
                this.saveCaptionSettings();
                this.saveTranscriptionProvider();
                this.updateProcessButton();
                this.showMessage('Caption generation settings reset to defaults.', 'success');
            },


            updatePromptEditorVisibility() {
                const method = document.getElementById('settingSegmentationMethod').value;
                const promptEditor = document.getElementById('aiPromptEditor');
                if (promptEditor) {
                    promptEditor.classList.toggle('hidden', method === 'rule-based');
                }
            },


            setPromptCollapsed(collapsed) {
                const content = document.getElementById('promptEditorContent');
                const toggleBtn = document.getElementById('togglePromptBtn');
                content.classList.toggle('hidden', collapsed);
                toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
                toggleBtn.setAttribute('aria-expanded', String(!collapsed));
                try {
                    localStorage.setItem(this.PROMPT_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
                } catch (error) {
                    console.error('Could not save prompt collapse state:', error);
                }
            },


            loadPromptCollapsedState() {
                try {
                    const saved = localStorage.getItem(this.PROMPT_COLLAPSED_STORAGE_KEY);
                    if (saved === 'true') {
                        this.setPromptCollapsed(true);
                    }
                } catch (error) {
                    console.error('Could not load prompt collapse state:', error);
                }
            },


            // The tuning section (everything below transcription provider /
            // segmentation method) starts collapsed every session unless the user
            // previously expanded it - same pattern as the AI prompt editor's
            // collapse state, just defaulting the other direction since these are
            // touched less often than the two dropdowns above them.
            setCaptionTuningCollapsed(collapsed) {
                const content = document.getElementById('captionTuningContent');
                const toggleBtn = document.getElementById('toggleCaptionTuningBtn');
                content.classList.toggle('hidden', collapsed);
                toggleBtn.textContent = collapsed ? 'Show tuning settings' : 'Hide tuning settings';
                toggleBtn.setAttribute('aria-expanded', String(!collapsed));
                try {
                    localStorage.setItem(this.CAPTION_TUNING_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
                } catch (error) {
                    console.error('Could not save caption tuning collapse state:', error);
                }
            },


            loadCaptionTuningCollapsedState() {
                try {
                    const saved = localStorage.getItem(this.CAPTION_TUNING_COLLAPSED_STORAGE_KEY);
                    this.setCaptionTuningCollapsed(saved !== 'false');
                } catch (error) {
                    console.error('Could not load caption tuning collapse state:', error);
                    this.setCaptionTuningCollapsed(true);
                }
            },


            // Unlike the tuning section, this starts expanded by default (it's
            // one-time-read background/help text, most useful visible on a first
            // visit) - only collapses once the user has explicitly done so before.
            setInfoBoxCollapsed(collapsed) {
                const content = document.getElementById('infoBoxContent');
                const toggleBtn = document.getElementById('toggleInfoBoxBtn');
                content.classList.toggle('hidden', collapsed);
                toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
                toggleBtn.setAttribute('aria-expanded', String(!collapsed));
                try {
                    localStorage.setItem(this.INFO_BOX_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
                } catch (error) {
                    console.error('Could not save info box collapse state:', error);
                }
            },


            loadInfoBoxCollapsedState() {
                try {
                    const saved = localStorage.getItem(this.INFO_BOX_COLLAPSED_STORAGE_KEY);
                    if (saved === 'true') {
                        this.setInfoBoxCollapsed(true);
                    }
                } catch (error) {
                    console.error('Could not load info box collapse state:', error);
                }
            },


            // On by default (this.spellcheckEnabled is already true from the
            // constructor) - only overridden if the user has explicitly turned it
            // off before.
            loadSpellcheckPreference() {
                try {
                    const saved = localStorage.getItem(this.SPELLCHECK_STORAGE_KEY);
                    this.spellcheckEnabled = saved !== 'false';
                } catch (error) {
                    console.error('Could not load spellcheck preference:', error);
                }
                document.getElementById('spellcheckToggle').checked = this.spellcheckEnabled;
            }
};
