export class ProfessionalCaptionGenerator {
            constructor() {
                this.files = [];
                this.transcripts = new Map();
                this.currentFileIndex = 0;
                this.audioUrls = new Map();
                this.currentCaptions = [];
                this.qualityData = new Map();
                this.fileScrollPositions = new Map(); // fileName -> transcriptEditor.scrollTop, captured when switching away from it
                // Chosen via showDirectoryPicker(). Remembered across reloads via
                // IndexedDB (see restoreSaveLocations/saveStoredHandle) - scoped to
                // this exact file:// path, so a copy or move of the file starts
                // fresh. Kept separate so captions and debug exports can go to
                // different folders.
                this.captionSaveDirectoryHandle = null;
                this.debugSaveDirectoryHandle = null;
                this.supportsFileSystemAccess = typeof window.showDirectoryPicker === 'function';
                this.processingTimes = new Map(); // Track timing for each step
                this.whisperResults = new Map(); // Cached per file so settings can be re-applied without re-transcribing
                this.undoStacks = new Map(); // fileName -> array of caption-array snapshots, for merge/split/delete/regenerate
                this.MAX_UNDO_STEPS = 20;
                this.pendingSessionSnapshot = null; // Set by checkForRecoverableSession while the recovery banner is showing
                // fileName -> { size, lastModified } of whichever File most recently
                // produced this.transcripts' entry for that name - lets a file
                // re-added after a session restore (no live File object to compare
                // against until then) still get the same "is this actually the same
                // content?" check as normal duplicate detection.
                this.fileMetaCache = new Map();
                this.playbackRate = 1; // Carries across file tabs until changed
                this.captionPreviewEndTime = null; // Set while previewing a single caption; timeupdate pauses when reached
                this.captionPreviewPending = false; // True right before our own audio.play() call, so the 'play' handler can tell it apart from the user pressing the native play button
                this.API_KEY_STORAGE_KEY = 'captionGenerator.openaiApiKey';
                this.ELEVENLABS_API_KEY_STORAGE_KEY = 'captionGenerator.elevenlabsApiKey';
                this.THEME_STORAGE_KEY = 'captionGenerator.theme';
                this.CAPTION_SETTINGS_STORAGE_KEY = 'captionGenerator.captionSettings';
                this.DICTIONARY_STORAGE_KEY = 'captionGenerator.technicalTerms';
                this.DOWNLOAD_FORMAT_STORAGE_KEY = 'captionGenerator.downloadFormat';
                this.PROMPT_COLLAPSED_STORAGE_KEY = 'captionGenerator.promptCollapsed';
                this.CAPTION_TUNING_COLLAPSED_STORAGE_KEY = 'captionGenerator.captionTuningCollapsed';
                this.INFO_BOX_COLLAPSED_STORAGE_KEY = 'captionGenerator.infoBoxCollapsed';
                this.SPELLCHECK_STORAGE_KEY = 'captionGenerator.spellcheckEnabled';
                this.TRANSCRIPTION_PROVIDER_STORAGE_KEY = 'captionGenerator.transcriptionProvider';
                this.UPDATE_CHECK_ENABLED_STORAGE_KEY = 'captionGenerator.updateCheckEnabled';
                this.UPDATE_LAST_CHECKED_STORAGE_KEY = 'captionGenerator.updateLastChecked';
                this.UPDATE_DISMISSED_VERSION_STORAGE_KEY = 'captionGenerator.updateDismissedVersion';
                // Bump alongside electron/package.json's "version" and the git tag
                // on every release - this is what the update-check banner (browser
                // build) compares the latest GitHub release against.
                this.APP_VERSION = '1.2.0';
                // On by default - flags real typos, at the cost of also flagging
                // technical terms the browser's dictionary doesn't know.
                this.spellcheckEnabled = true;
                // Per-request upload caps used when chunking audio - Whisper's is a
                // hard API limit (25MB) with headroom to spare; ElevenLabs allows up
                // to 5GB, but a much smaller generous cap still keeps individual
                // requests reasonably sized while meaning typical multi-hour training
                // audio needs few or no chunks at all.
                this.WHISPER_MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
                this.ELEVENLABS_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
                this.DEFAULT_CAPTION_SETTINGS = {
                    maxChars: 60,
                    targetChars: 40,
                    minDuration: 1.0,
                    maxDuration: 7.0,
                    maxReadingSpeed: 20,
                    gapThreshold: 1.0,
                    pauseThreshold: 0.6,
                    leadIn: 0.1,
                    hold: 0.2,
                    segmentationMethod: 'rule-based',
                    customPrompt: `You are a professional caption editor. Break this transcript into optimal caption segments following broadcast standards.

CRITICAL TEXT REQUIREMENTS:
- Use EXACTLY the same words, punctuation, and spacing as provided
- Do NOT change, add, remove, or rephrase ANY text whatsoever
- Simply arrange the existing text into readable caption segments

CHARACTER LIMITS (HARD CONSTRAINT - NEVER VIOLATE):
- ABSOLUTE MAXIMUM: {{maxChars}} characters. No caption segment may ever exceed this, no matter what.
- TARGET: {{targetLow}}-{{targetHigh}} characters per segment (ideal reading length)
- RANGE: {{preferredLow}}-{{preferredHigh}} characters preferred for natural language breaks

WHERE TO BREAK (apply in this priority order, but never let any of these push a segment past the {{maxChars}}-character maximum above):
1. FIRST CHOICE - sentence boundaries: end a caption where a sentence ends (. ! ?) and start the next caption with the next sentence. Don't let a sentence trail off into the same caption as the start of the next one.
2. SECOND CHOICE - major punctuation: if a single sentence is too long to fit in one caption, break it at a comma, semicolon, colon, or dash rather than at an arbitrary word. These marks usually fall at natural pauses in speech, which is exactly where a caption break should be.
3. THIRD CHOICE - clause boundaries: if there's no nearby punctuation to break at, break before a natural clause boundary (e.g. before "and", "but", "because", "which").
4. LAST RESORT - word boundaries: only break at a plain word boundary with no punctuation or clause cue nearby, and never mid-word.
- When two valid break points both keep you under {{maxChars}} characters, always prefer the one that lands on punctuation (a sentence end, comma, or semicolon) over one that doesn't - even if the punctuation-aligned option is a bit shorter than the target range.
- "And that's it! At this point..." should become two captions: "And that's it!" and "At this point..." - never merge across a sentence boundary if the combined text would exceed the target length.
- Only combine a sentence ending with the next sentence's beginning into one caption if both together stay comfortably under {{maxChars}} characters.

TRANSCRIPT TO SEGMENT:
"{{transcript}}"

Return ONLY a JSON array of caption text segments using the exact original text.
Example: ["And that's it!", "At this point, you now know", "the basics of installing software."]

REMEMBER: The {{maxChars}}-character maximum can never be violated. Within that constraint, prefer breaking at sentence ends first, then commas/semicolons, then clause boundaries, and only fall back to a plain word boundary as a last resort.`
                };

                // The prompt textarea starts empty in HTML (it's a large block of
                // text not worth duplicating in the page source) - fill it with
                // the default here before loadCaptionSettings() below potentially
                // overrides it with a saved custom version.
                document.getElementById('settingCustomPrompt').value = this.DEFAULT_CAPTION_SETTINGS.customPrompt;

                this.loadSavedTheme();
                this.loadSavedApiKey();
                this.loadSavedElevenlabsApiKey();
                this.loadCaptionSettings();
                this.loadTranscriptionProvider();
                this.updatePromptEditorVisibility();
                this.loadPromptCollapsedState();
                this.loadCaptionTuningCollapsedState();
                this.loadInfoBoxCollapsedState();
                this.loadSpellcheckPreference();
                this.loadSavedDictionary();
                this.loadSavedDownloadFormat();
                document.getElementById('saveLocationSection').classList.toggle('hidden', !this.supportsFileSystemAccess);
                this.restoreSaveLocations();
                this.checkForRecoverableSession();
                this.initializeElectronIntegration();
                this.loadUpdateCheckPreference();
                this.checkForUpdates();
                this.initializeEventListeners();
                this.setupDragAndDrop();
                this.updateProcessButton();

                this.captionCards = [];
                this.activeCaptionIndex = -1;
            }
}
