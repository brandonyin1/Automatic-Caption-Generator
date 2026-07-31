export const orchestrationMethods = {

            initializeEventListeners() {
                try {
                    // File upload events
                    document.getElementById('uploadArea').addEventListener('click', () => {
                        document.getElementById('fileInput').click();
                    });
                    
                    document.getElementById('fileInput').addEventListener('change', (e) => {
                        this.handleFiles(Array.from(e.target.files));
                    });

                    // Technical terms dictionary
                    document.getElementById('technicalTerms').addEventListener('input', () => {
                        this.saveDictionary();
                    });

                    // API key validation
                    document.getElementById('apiKey').addEventListener('input', () => {
                        this.updateProcessButton();
                        this.saveApiKey(document.getElementById('apiKey').value);
                    });

                    document.getElementById('rememberApiKey').addEventListener('change', (e) => {
                        if (e.target.checked) {
                            this.saveApiKey(document.getElementById('apiKey').value);
                        } else {
                            localStorage.removeItem(this.API_KEY_STORAGE_KEY);
                        }
                    });

                    document.getElementById('elevenlabsApiKey').addEventListener('input', () => {
                        this.updateProcessButton();
                        this.saveElevenlabsApiKey(document.getElementById('elevenlabsApiKey').value);
                    });

                    document.getElementById('rememberElevenlabsApiKey').addEventListener('change', (e) => {
                        if (e.target.checked) {
                            this.saveElevenlabsApiKey(document.getElementById('elevenlabsApiKey').value);
                        } else {
                            localStorage.removeItem(this.ELEVENLABS_API_KEY_STORAGE_KEY);
                        }
                    });

                    // Theme toggle
                    document.getElementById('themeToggle').addEventListener('click', () => {
                        this.toggleTheme();
                    });

                    // What's New modal
                    document.getElementById('whatsNewBtn').addEventListener('click', () => {
                        document.getElementById('whatsNewOverlay').classList.add('visible');
                    });
                    document.getElementById('whatsNewClose').addEventListener('click', () => {
                        document.getElementById('whatsNewOverlay').classList.remove('visible');
                    });
                    document.getElementById('whatsNewOverlay').addEventListener('click', (e) => {
                        if (e.target.id === 'whatsNewOverlay') {
                            document.getElementById('whatsNewOverlay').classList.remove('visible');
                        }
                    });

                    // Settings modal
                    document.getElementById('settingsBtn').addEventListener('click', () => {
                        document.getElementById('settingsOverlay').classList.add('visible');
                    });
                    document.getElementById('settingsClose').addEventListener('click', () => {
                        document.getElementById('settingsOverlay').classList.remove('visible');
                    });
                    document.getElementById('settingsOverlay').addEventListener('click', (e) => {
                        if (e.target.id === 'settingsOverlay') {
                            document.getElementById('settingsOverlay').classList.remove('visible');
                        }
                    });

                    document.getElementById('exportDebugBtn').addEventListener('click', () => {
                        this.exportDebugInfo();
                    });

                    // Find & Replace modal
                    document.getElementById('findReplaceBtn').addEventListener('click', () => {
                        document.getElementById('findReplaceOverlay').classList.add('visible');
                        document.getElementById('findText').focus();
                    });
                    document.getElementById('findReplaceClose').addEventListener('click', () => {
                        document.getElementById('findReplaceOverlay').classList.remove('visible');
                    });
                    document.getElementById('findReplaceOverlay').addEventListener('click', (e) => {
                        if (e.target.id === 'findReplaceOverlay') {
                            document.getElementById('findReplaceOverlay').classList.remove('visible');
                        }
                    });
                    document.getElementById('findReplaceApplyBtn').addEventListener('click', () => {
                        this.applyFindReplace();
                    });

                    // Session recovery banner
                    document.getElementById('restoreSessionBtn').addEventListener('click', () => {
                        this.restoreSession();
                    });
                    document.getElementById('discardSessionBtn').addEventListener('click', () => {
                        this.discardSession();
                    });

                    // Update-available banner
                    document.getElementById('dismissUpdateBtn').addEventListener('click', () => {
                        this.dismissUpdateBanner();
                    });

                    document.getElementById('updateCheckToggle').addEventListener('change', (e) => {
                        this.updateCheckEnabled = e.target.checked;
                        try {
                            localStorage.setItem(this.UPDATE_CHECK_ENABLED_STORAGE_KEY, this.updateCheckEnabled ? 'true' : 'false');
                        } catch (error) {
                            console.error('Could not save update-check preference:', error);
                        }
                        if (this.updateCheckEnabled) {
                            localStorage.removeItem(this.UPDATE_LAST_CHECKED_STORAGE_KEY);
                            this.checkForUpdates();
                        }
                    });

                    // Caption generation settings
                    ['settingMaxChars', 'settingTargetChars', 'settingMinDuration', 'settingMaxDuration', 'settingMaxReadingSpeed', 'settingGapThreshold', 'settingPauseThreshold', 'settingLeadIn', 'settingHold', 'settingSegmentationMethod', 'settingCustomPrompt'].forEach(id => {
                        document.getElementById(id).addEventListener('change', () => {
                            this.saveCaptionSettings();
                        });
                    });

                    document.getElementById('settingSegmentationMethod').addEventListener('change', () => {
                        this.updatePromptEditorVisibility();
                        this.updateProcessButton();
                    });

                    document.getElementById('settingTranscriptionProvider').addEventListener('change', () => {
                        this.saveTranscriptionProvider();
                        this.updateProcessButton();
                    });

                    document.getElementById('resetPromptBtn').addEventListener('click', () => {
                        document.getElementById('settingCustomPrompt').value = this.DEFAULT_CAPTION_SETTINGS.customPrompt;
                        this.saveCaptionSettings();
                        this.showMessage('Prompt reset to default.', 'success');
                    });

                    document.getElementById('togglePromptBtn').addEventListener('click', () => {
                        const isCollapsed = document.getElementById('promptEditorContent').classList.contains('hidden');
                        this.setPromptCollapsed(!isCollapsed);
                    });

                    document.getElementById('toggleCaptionTuningBtn').addEventListener('click', () => {
                        const isCollapsed = document.getElementById('captionTuningContent').classList.contains('hidden');
                        this.setCaptionTuningCollapsed(!isCollapsed);
                    });

                    document.getElementById('toggleInfoBoxBtn').addEventListener('click', () => {
                        const isCollapsed = document.getElementById('infoBoxContent').classList.contains('hidden');
                        this.setInfoBoxCollapsed(!isCollapsed);
                    });

                    document.getElementById('spellcheckToggle').addEventListener('change', (e) => {
                        this.spellcheckEnabled = e.target.checked;
                        try {
                            localStorage.setItem(this.SPELLCHECK_STORAGE_KEY, this.spellcheckEnabled ? 'true' : 'false');
                        } catch (error) {
                            console.error('Could not save spellcheck preference:', error);
                        }
                        // Applies live to whatever's already rendered - spellcheck is
                        // a real DOM/IDL property, not just an attribute, so this
                        // takes effect immediately without rebuilding any cards.
                        document.querySelectorAll('.caption-text').forEach(el => {
                            el.spellcheck = this.spellcheckEnabled;
                        });
                    });

                    document.getElementById('resetCaptionSettings').addEventListener('click', () => {
                        this.resetCaptionSettings();
                    });

                    document.getElementById('exportSettingsBtn').addEventListener('click', () => {
                        this.exportSettingsAndDictionary();
                    });

                    document.getElementById('importSettingsBtn').addEventListener('click', () => {
                        document.getElementById('importSettingsInput').click();
                    });

                    document.getElementById('importSettingsInput').addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            this.importSettingsAndDictionary(file);
                        }
                        // Cleared so re-selecting the same file still fires 'change'.
                        e.target.value = '';
                    });

                    // Process button
                    document.getElementById('processBtn').addEventListener('click', () => {
                        this.handleProcessClick();
                    });

                    // Audio player events
                    const audioPlayer = document.getElementById('audioPlayer');
                    audioPlayer.addEventListener('timeupdate', () => {
                        this.updateCurrentCaption();

                        if (this.captionPreviewEndTime !== null && audioPlayer.currentTime >= this.captionPreviewEndTime) {
                            audioPlayer.pause();
                            this.captionPreviewEndTime = null;
                        }
                    });

                    // Distinguishes a caption-card click (bounded single-caption
                    // preview) from the user pressing the native play button
                    // (resume normal, unbounded playback) - both fire this same
                    // 'play' event, so a flag set just before our own .play() calls
                    // is the only way to tell them apart.
                    audioPlayer.addEventListener('play', () => {
                        if (this.captionPreviewPending) {
                            this.captionPreviewPending = false;
                        } else {
                            this.captionPreviewEndTime = null;
                        }
                    });

                    document.getElementById('playbackSpeed').addEventListener('change', (e) => {
                        this.playbackRate = parseFloat(e.target.value);
                        audioPlayer.playbackRate = this.playbackRate;
                    });

                    this.setupCustomPlayer(audioPlayer);

                    // Download events
                    document.getElementById('downloadAll').addEventListener('click', () => {
                        this.downloadAllCaptions();
                    });
                    document.getElementById('downloadCurrent').addEventListener('click', () => {
                        this.downloadCurrentCaptions();
                    });
                    document.getElementById('downloadFormat').addEventListener('change', (e) => {
                        this.saveDownloadFormat(e.target.value);
                    });
                    document.getElementById('downloadTranscript').addEventListener('click', () => {
                        this.downloadTranscript();
                    });

                    document.getElementById('chooseCaptionSaveLocationBtn').addEventListener('click', () => {
                        this.chooseSaveLocation('caption');
                    });
                    document.getElementById('clearCaptionSaveLocationBtn').addEventListener('click', () => {
                        this.captionSaveDirectoryHandle = null;
                        this.updateSaveLocationUI('caption');
                        this.clearStoredHandle('caption');
                        this.showMessage('Caption downloads will save to your browser\'s default location again.', 'info');
                    });

                    document.getElementById('chooseDebugSaveLocationBtn').addEventListener('click', () => {
                        this.chooseSaveLocation('debug');
                    });
                    document.getElementById('clearDebugSaveLocationBtn').addEventListener('click', () => {
                        this.debugSaveDirectoryHandle = null;
                        this.updateSaveLocationUI('debug');
                        this.clearStoredHandle('debug');
                        this.showMessage('Debug exports will save to your browser\'s default location again.', 'info');
                    });

                    // Quality toggle
                    document.getElementById('qualityToggle').addEventListener('click', () => {
                        this.toggleQualityDetails();
                    });

                    document.getElementById('regenerateCaptions').addEventListener('click', () => {
                        this.regenerateCurrentFileCaptions();
                    });

                    document.getElementById('scrollToTuningBtn').addEventListener('click', () => {
                        this.setCaptionTuningCollapsed(false);
                        const target = document.getElementById('generationSettings');
                        if (target) {
                            this.scrollToElementBelowHeader(target);
                        }
                    });

                    document.getElementById('undoBtn').addEventListener('click', () => {
                        const currentFile = this.files[this.currentFileIndex];
                        if (currentFile) {
                            this.undoLastEdit(currentFile.name);
                        }
                    });

                    document.getElementById('fixIssuesBtn').addEventListener('click', () => {
                        const currentFile = this.files[this.currentFileIndex];
                        if (currentFile) {
                            this.autoFixCaptionIssues(currentFile.name);
                        } else {
                            this.showMessage('Select a processed file first.', 'warning');
                        }
                    });

                    document.addEventListener('keydown', (e) => {
                        this.handleGlobalKeydown(e);
                    });

                } catch (error) {
                    console.error('Error initializing event listeners:', error);
                    this.showMessage('Failed to initialize application', 'error');
                }
            },


            // Which API key(s) are actually required depends on both the
            // transcription provider and the segmentation method - GPT segmentation
            // needs the OpenAI key even when ElevenLabs is doing the transcribing.
            getRequiredApiKeyStatus() {
                const provider = document.getElementById('settingTranscriptionProvider').value;
                const segmentationMethod = document.getElementById('settingSegmentationMethod').value;
                const openaiKey = document.getElementById('apiKey').value.trim();
                const elevenlabsKey = document.getElementById('elevenlabsApiKey').value.trim();

                const needsOpenAI = provider === 'whisper' || segmentationMethod !== 'rule-based';
                const needsElevenLabs = provider === 'elevenlabs';
                const openaiOk = !needsOpenAI || openaiKey.startsWith('sk-');
                const elevenlabsOk = !needsElevenLabs || elevenlabsKey.length > 0;

                return {
                    needsOpenAI, needsElevenLabs, openaiOk, elevenlabsOk,
                    valid: openaiOk && elevenlabsOk
                };
            },


            handleProcessClick() {
                const status = this.getRequiredApiKeyStatus();
                const hasFiles = this.files.length > 0;

                if (!status.openaiOk) {
                    document.getElementById('settingsOverlay').classList.add('visible');
                    document.getElementById('apiKey').focus();
                    this.showMessage('Please enter a valid OpenAI API key in Settings to continue.', 'error');
                    return;
                }

                if (!status.elevenlabsOk) {
                    document.getElementById('settingsOverlay').classList.add('visible');
                    document.getElementById('elevenlabsApiKey').focus();
                    this.showMessage('Please enter your ElevenLabs API key in Settings to continue.', 'error');
                    return;
                }

                if (!hasFiles) {
                    this.showMessage('Please select audio files first.', 'error');
                    return;
                }

                this.processFiles();
            },


            setupDragAndDrop() {
                const uploadArea = document.getElementById('uploadArea');

                uploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploadArea.classList.add('dragover');
                });

                uploadArea.addEventListener('dragleave', () => {
                    uploadArea.classList.remove('dragover');
                });

                uploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    uploadArea.classList.remove('dragover');
                    this.handleFiles(Array.from(e.dataTransfer.files));
                });
            },


            logMessage(message, type = 'info') {
                const timestamp = new Date().toLocaleTimeString();
                let emoji = '🔄';
                
                switch(type) {
                    case 'success': emoji = '✅'; break;
                    case 'error': emoji = '❌'; break;
                    case 'warning': emoji = '⚠️'; break;
                    case 'info': emoji = 'ℹ️'; break;
                    case 'plain': emoji = ''; break; // No emoji for plain messages
                }
                
                // Don't add emoji to blank lines, separators, or messages that already have emojis
                const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(message);
                const isBlankOrSeparator = message.trim() === '' || /^[=\-\s]*$/.test(message.trim());
                
                let logEntry;
                if (isBlankOrSeparator || hasEmoji || type === 'plain') {
                    logEntry = message;
                } else {
                    logEntry = `${emoji} ${message}`;
                }
                
                console.log(`${timestamp} ${logEntry}`);
                
                // Progress log display - cleaner format
                const progressLog = document.getElementById('progressLog');
                if (progressLog) {
                    progressLog.textContent += logEntry + '\n';
                    progressLog.scrollTop = progressLog.scrollHeight;
                }
            },


            clearProgressLog() {
                const progressLog = document.getElementById('progressLog');
                if (progressLog) {
                    progressLog.textContent = '';
                }
            },


            async processFiles() {
                const provider = document.getElementById('settingTranscriptionProvider').value;
                const apiKey = provider === 'elevenlabs'
                    ? document.getElementById('elevenlabsApiKey').value.trim()
                    : document.getElementById('apiKey').value.trim();
                const maxUploadBytes = provider === 'elevenlabs'
                    ? this.ELEVENLABS_MAX_UPLOAD_BYTES
                    : this.WHISPER_MAX_UPLOAD_BYTES;
                const providerLabel = provider === 'elevenlabs' ? 'ElevenLabs Scribe' : 'Whisper';
                const batchStartTime = Date.now();

                // Only files without finished captions get (re)processed - added
                // files that already have work (transcribed, edited, whatever)
                // are left completely alone, rather than wiping and redoing
                // everything on every Generate click. A file only ends up with an
                // entry in this.transcripts once it fully succeeds, so a
                // previously-failed file is naturally retried here too.
                const filesToProcess = this.files.filter(f => !this.transcripts.has(f.name));

                if (filesToProcess.length === 0) {
                    // Every selected file already has captions cached (e.g. all
                    // of them came from a session restore, so none were ever
                    // freshly generated this page load) - still show the
                    // results view instead of just returning, otherwise the
                    // captions exist in memory but nothing on screen ever
                    // reveals them.
                    if (document.getElementById('results').style.display !== 'block') {
                        this.showResults();
                        this.showQualitySummary();
                    }
                    this.showMessage('All selected files already have captions. Remove and re-add a file if you want to re-transcribe it from scratch.', 'info');
                    return;
                }

                this.showProgress();
                this.clearProgressLog();

                const skippedCount = this.files.length - filesToProcess.length;
                this.logMessage(`Starting processing of ${filesToProcess.length} file${filesToProcess.length === 1 ? '' : 's'}` +
                    (skippedCount > 0 ? ` (${skippedCount} already processed - skipping)` : '') + '...');

                let successCount = 0;
                let errorCount = 0;
                const failedFiles = [];

                try {
                    for (let i = 0; i < filesToProcess.length; i++) {
                        const file = filesToProcess[i];
                        const progress = (i / filesToProcess.length) * 90;

                        // Add spacing between files in debug log
                        if (i > 0) {
                            this.logMessage(`\n${'='.repeat(60)}`, 'plain');
                        }

                        this.updateProgress(progress, `Processing ${file.name}... (${i + 1}/${filesToProcess.length})`);
                        this.logMessage(`📁 FILE ${i + 1}/${filesToProcess.length}: ${file.name}`, 'plain');
                        
                        // Initialize timing data for this file
                        this.processingTimes.set(file.name, {});
                        
                        try {
                            // Phase 0: Prepare audio - decode/downsample/chunk so every
                            // file (audio or video) stays under the selected provider's
                            // upload limit
                            this.logMessage(this.isVideoFile(file) ?
                                `🎬 Phase 0: Video detected - preparing audio for transcription...` :
                                `🎵 Phase 0: Preparing audio for transcription...`, 'plain');
                            const prepStart = Date.now();
                            const audioChunks = await this.prepareAudioForTranscription(file, maxUploadBytes);
                            const prepDuration = ((Date.now() - prepStart) / 1000).toFixed(1);
                            this.processingTimes.get(file.name).extraction = prepDuration;
                            const prepSummary = audioChunks.length > 1 ?
                                `${audioChunks.length} chunks` :
                                `${(audioChunks[0].file.size / 1024 / 1024).toFixed(1)}MB`;
                            this.logMessage(`✅ Phase 0: Audio ready - ${prepSummary} (${prepDuration}s)`, 'plain');

                            // Phase 1: transcription
                            this.logMessage(`🎯 Phase 1: Audio transcription with ${providerLabel}...`, 'plain');
                            const phase1Start = Date.now();
                            const whisperResult = await this.transcribeChunks(audioChunks, provider, apiKey);
                            const phase1Duration = ((Date.now() - phase1Start) / 1000).toFixed(1);
                            this.processingTimes.get(file.name).phase1 = phase1Duration;
                            this.logMessage(`✅ Phase 1: Complete - ${whisperResult.text.length} characters transcribed (${phase1Duration}s)`, 'plain');

                            // Cache the transcription so caption settings can be tweaked
                            // and re-applied later via "Regenerate Captions" without
                            // paying for transcription again. Deliberately not re-read
                            // from the provider dropdown anywhere else - regenerating
                            // must keep using whichever provider actually produced this
                            // cached result, even if the dropdown gets changed afterward.
                            this.whisperResults.set(file.name, whisperResult);
                            
                            // Phase 2 & 3: Generate captions
                            this.logMessage(`🤖 Phase 2: Intelligent caption segmentation...`, 'plain');
                            const phase2Start = Date.now();
                            const professionalCaptions = await this.generateProfessionalCaptions(whisperResult, file.name);
                            const phase2Duration = ((Date.now() - phase2Start) / 1000).toFixed(1);
                            this.processingTimes.get(file.name).phase2 = phase2Duration;
                            this.logMessage(`✅ Phase 2-3: Complete - ${professionalCaptions.length} captions generated (${phase2Duration}s)`, 'plain');
                            
                            // Validation check
                            if (!professionalCaptions || professionalCaptions.length === 0) {
                                throw new Error('No captions were generated for this file');
                            }
                            
                            this.transcripts.set(file.name, professionalCaptions);
                            this.fileMetaCache.set(file.name, { size: file.size, lastModified: file.lastModified });

                            // Create audio URL for playback
                            const audioUrl = URL.createObjectURL(file);
                            this.audioUrls.set(file.name, audioUrl);
                            
                            // Generate quality summary
                            this.generateQualitySummary(file.name, professionalCaptions, whisperResult.text);

                            // Save per-file (not just once at the end of the batch) so
                            // a crash partway through a large multi-file batch doesn't
                            // lose the files that already finished.
                            this.saveSessionSnapshot();

                            successCount++;
                            
                            // Calculate total time including audio prep
                            const prepTime = this.processingTimes.get(file.name).extraction || 0;
                            const totalTime = (parseFloat(prepTime) + parseFloat(phase1Duration) + parseFloat(phase2Duration)).toFixed(1);
                            this.processingTimes.get(file.name).total = totalTime;

                            const timingDetails =
                                `(Audio prep: ${prepTime}s + Transcription: ${phase1Duration}s + Processing: ${phase2Duration}s = Total: ${totalTime}s)`;
                            
                            this.logMessage(`✅ File ${file.name} processed successfully ${timingDetails}`, 'plain');

                        } catch (fileError) {
                            errorCount++;
                            failedFiles.push({
                                name: file.name,
                                error: fileError.message,
                                position: i + 1
                            });
                            this.logMessage(`❌ FAILED: ${file.name} - ${fileError.message}`, 'plain');
                            console.error(`Error processing ${file.name}:`, fileError);
                        }
                    }

                    this.updateProgress(100, 'Processing completed!');
                    this.logMessage(`\n🏁 PROCESSING COMPLETE: ${successCount} successful, ${errorCount} failed`, 'plain');
                    
                    // Log detailed failure information
                    if (failedFiles.length > 0) {
                        this.logMessage(`\n❌ FAILED FILES DETAILS:`, 'plain');
                        failedFiles.forEach(failed => {
                            this.logMessage(`   File ${failed.position}: ${failed.name} - ${failed.error}`, 'error');
                        });
                    }

                    const totalElapsed = (Date.now() - batchStartTime) / 1000;
                    this.logMessage(`⏱️ Total processing time: ${this.formatDuration(totalElapsed)}`, 'plain');

                    if (successCount > 0) {
                        setTimeout(() => {
                            this.hideProgress();
                            this.showResults();
                            this.showQualitySummary();
                            
                            if (errorCount > 0) {
                                this.showMessage(`⚠️ Processing completed: ${successCount} successful, ${errorCount} failed. Check logs above for details.`, 'warning');
                            } else {
                                this.showMessage(`✅ Successfully processed all ${successCount} files!`, 'success');
                            }
                        }, 2000);
                    } else {
                        this.logMessage(`❌ No files were processed successfully`, 'error');
                        this.showMessage(`❌ Failed to process any files. Check the processing log above for details.`, 'error');
                    }

                } catch (error) {
                    this.logMessage(`❌ Critical error: ${error.message}`, 'error');
                    const totalElapsed = (Date.now() - batchStartTime) / 1000;
                    this.logMessage(`⏱️ Total processing time: ${this.formatDuration(totalElapsed)}`, 'plain');
                    this.showMessage(`❌ Processing failed: ${error.message}`, 'error');
                    console.error('Processing error:', error);
                }
            },


            // "45.2s" for anything under a minute, "2m 34s" once it crosses into
            // minutes (dropping sub-second precision there - not useful at that scale).
            formatDuration(totalSeconds) {
                if (totalSeconds < 60) {
                    return `${totalSeconds.toFixed(1)}s`;
                }
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = Math.round(totalSeconds % 60);
                return `${minutes}m ${seconds}s`;
            },


            // Global shortcuts: Space (play/pause), Left/Right (seek ±5s),
            // Up/Down (jump to previous/next caption), Ctrl/Cmd+Z (undo). Ignored
            // whenever focus is on anything editable (text fields, contenteditable
            // caption text, buttons, selects, range inputs) so typing or using the
            // seekbar's own native keyboard handling isn't hijacked.
            handleGlobalKeydown(e) {
                if (e.key === 'Escape') {
                    const whatsNewOverlay = document.getElementById('whatsNewOverlay');
                    if (whatsNewOverlay.classList.contains('visible')) {
                        whatsNewOverlay.classList.remove('visible');
                        return;
                    }
                    const settingsOverlay = document.getElementById('settingsOverlay');
                    if (settingsOverlay.classList.contains('visible')) {
                        settingsOverlay.classList.remove('visible');
                        return;
                    }
                    const findReplaceOverlay = document.getElementById('findReplaceOverlay');
                    if (findReplaceOverlay.classList.contains('visible')) {
                        findReplaceOverlay.classList.remove('visible');
                        return;
                    }
                }

                const active = document.activeElement;
                const isEditableContext = !!active && (
                    active.tagName === 'INPUT' ||
                    active.tagName === 'TEXTAREA' ||
                    active.tagName === 'SELECT' ||
                    active.tagName === 'BUTTON' ||
                    active.isContentEditable
                );

                const isUndoCombo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
                if (isUndoCombo && !isEditableContext) {
                    e.preventDefault();
                    const currentFile = this.files[this.currentFileIndex];
                    if (currentFile) {
                        this.undoLastEdit(currentFile.name);
                    }
                    return;
                }

                if (isEditableContext) {
                    return;
                }

                const results = document.getElementById('results');
                if (!results || results.style.display !== 'block') {
                    return;
                }

                const audioPlayer = document.getElementById('audioPlayer');

                switch (e.key) {
                    case ' ':
                    case 'Spacebar':
                        e.preventDefault();
                        if (audioPlayer.paused) {
                            audioPlayer.play();
                        } else {
                            audioPlayer.pause();
                        }
                        break;
                    case 'ArrowLeft':
                        e.preventDefault();
                        audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        audioPlayer.currentTime = Math.min(audioPlayer.duration || Infinity, audioPlayer.currentTime + 5);
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        if (e.shiftKey) {
                            this.jumpToFlaggedCaption(-1);
                        } else {
                            this.jumpToAdjacentCaption(-1);
                        }
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        if (e.shiftKey) {
                            this.jumpToFlaggedCaption(1);
                        } else {
                            this.jumpToAdjacentCaption(1);
                        }
                        break;
                }
            },


            // Moves to and previews the previous/next caption card, reusing the
            // card's own click handler (bounded single-caption playback) rather
            // than duplicating that logic.
            jumpToAdjacentCaption(direction) {
                if (!this.currentCaptions || this.currentCaptions.length === 0) {
                    return;
                }

                let nextIndex;
                if (this.activeCaptionIndex < 0) {
                    nextIndex = direction > 0 ? 0 : this.currentCaptions.length - 1;
                } else {
                    nextIndex = this.activeCaptionIndex + direction;
                }
                nextIndex = Math.max(0, Math.min(this.currentCaptions.length - 1, nextIndex));

                const card = this.captionCards[nextIndex];
                if (card) {
                    card.click();
                }
            },


            // Scans forward/backward from the currently active caption for the
            // next one with an issue, skipping clean captions in between - lets
            // you review just what needs attention in a long file instead of
            // stepping through every caption. "Flagged" here matches exactly what
            // the ⚠️ badge shows (evaluateCaptionIssues minus TOO_LONG/TOO_FAST,
            // which already have their own dedicated indicator on the stats line -
            // same filter updateIssueBadge applies), not the raw unfiltered issue
            // list. Stops at the array boundary with a message rather than
            // wrapping around, matching typical find-next behavior.
            jumpToFlaggedCaption(direction) {
                if (!this.currentCaptions || this.currentCaptions.length === 0) {
                    return;
                }

                const currentFile = this.files[this.currentFileIndex];
                const settings = this.getCaptionSettings();
                const quality = this.qualityData.get(currentFile.name);
                const issueContext = { mismatchCaptionIndex: quality?.textMatched?.mismatchCaptionIndex ?? null };

                const isFlagged = (caption) => {
                    const issues = this.evaluateCaptionIssues(caption, settings, issueContext);
                    return issues.some(i => i.type !== 'TOO_LONG' && i.type !== 'TOO_FAST');
                };

                const total = this.currentCaptions.length;
                const start = this.activeCaptionIndex < 0
                    ? (direction > 0 ? 0 : total - 1)
                    : this.activeCaptionIndex + direction;

                for (let index = start; index >= 0 && index < total; index += direction) {
                    if (isFlagged(this.currentCaptions[index])) {
                        const card = this.captionCards[index];
                        if (card) {
                            card.click();
                        }
                        return;
                    }
                }
                this.showMessage('No more flagged captions in that direction.', 'info');
            },


            // Adds/updates/removes the ⚠️ warning badge on a caption card based on
            // evaluateCaptionIssues() - the same check used in the quality summary
            // (which still reports every issue type, unfiltered), minus the two
            // types that already have their own dedicated indicator on the card.
            updateIssueBadge(card, caption, settings, context = {}) {
                const allIssues = this.evaluateCaptionIssues(caption, settings, context);
                // TOO_LONG and TOO_FAST already have their own always-visible
                // indicator - the char/char-per-sec stats line below turns that
                // specific number red on its own (updateCaptionStats). Flagging
                // them again here too would just be the same information twice,
                // so the badge only covers issues that don't already have a
                // dedicated visual cue.
                const badgeIssues = allIssues.filter(i => i.type !== 'TOO_LONG' && i.type !== 'TOO_FAST');
                card.classList.toggle('has-issue', badgeIssues.length > 0);

                const header = card.querySelector('.caption-header');
                let badge = header.querySelector('.issue-badge');

                if (badgeIssues.length > 0) {
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'issue-badge';
                        header.appendChild(badge);
                    }
                    badge.textContent = `⚠️ ${badgeIssues.length} issue${badgeIssues.length > 1 ? 's' : ''}`;
                    badge.title = badgeIssues.map(i => i.label).join(' • ');
                } else if (badge) {
                    badge.remove();
                }
            },


            // Always-visible character-count/reading-speed readout on each card
            // (separate from the issue badge, which only appears when something's
            // actually wrong). Recomputed fresh from the live caption object, so
            // it stays in sync with edits the same way the issue badge does -
            // numbers alone turn the warning color when they cross the configured
            // threshold, without waiting for the full issue check.
            updateCaptionStats(card, caption, settings) {
                const statsEl = card.querySelector('.caption-stats');
                if (!statsEl) {
                    return;
                }

                const length = caption.text.length;
                const duration = caption.end - caption.start;
                const cps = duration > 0 ? length / duration : 0;

                const lengthWarn = length > settings.maxChars;
                const speedWarn = duration > 0 && cps > settings.maxReadingSpeed;

                statsEl.innerHTML = `<span class="${lengthWarn ? 'stat-warn' : ''}">${length} chars</span> · <span class="${speedWarn ? 'stat-warn' : ''}">${cps.toFixed(1)} char/s</span>`;
                statsEl.title = `${length} characters over ${duration.toFixed(2)}s on screen`;
            },


            showProgress() {
                document.getElementById('progress').style.display = 'block';
                document.getElementById('processBtn').disabled = true;
            },


            hideProgress() {
                // Keep progress section visible but update the title and button
                document.getElementById('progressText').textContent = 'Processing Complete - Logs Available Below';
                document.getElementById('progressFill').style.width = '100%';
                this.updateProcessButton();
                
                // Add a note about keeping logs visible
                this.logMessage(`\n📋 Processing logs kept visible for debugging. Scroll up to review any issues.`, 'plain');
            },


            updateProgress(percent, text) {
                document.getElementById('progressFill').style.width = `${percent}%`;
                document.getElementById('progressText').textContent = text;
            },


            showResults() {
                this.setupFileTabs();
                this.loadCurrentFile();
                document.getElementById('results').style.display = 'block';
            },


            showQualitySummary() {
                document.getElementById('qualitySummary').style.display = 'block';
                this.updateQualitySummaryForCurrentFile();
            },


            updateQualitySummaryForCurrentFile() {
                const currentFile = this.files[this.currentFileIndex];
                const summary = this.qualityData.get(currentFile.name);
                
                if (!summary) {
                    // Handle failed files
                    const qualityContent = document.getElementById('qualityContent');
                    qualityContent.innerHTML = `
                        <strong>${currentFile.name}:</strong> ❌ Processing failed<br>
                        <strong>Status:</strong> This file could not be processed<br>
                        <strong>Check:</strong> Review processing logs above for error details
                    `;
                    
                    const qualityDetails = document.getElementById('qualityDetails');
                    qualityDetails.textContent = `FILE PROCESSING FAILED\n\nThis file encountered an error during processing and no captions were generated.\n\nCommon causes:\n• Unsupported audio format\n• Corrupted or damaged file\n• File too short (less than 1 second)\n• Network connectivity issues\n• API rate limiting\n\nCheck the processing logs above for the specific error message.`;
                    return;
                }
                
                const qualityContent = document.getElementById('qualityContent');
                const s = summary.settings;
                const textMatchStatus = summary.textMatched.isGoodMatch ?
                    '✅ Perfect match' :
                    `⚠️ Differences detected${summary.textMatched.mismatchCaptionIndex ? ` near caption #${summary.textMatched.mismatchCaptionIndex}` : ''} (see details)`;
                const lengthStatus = summary.tooLong === 0 ?
                    `✅ All captions within ${s.maxChars}-character limit` :
                    `⚠️ ${summary.tooLong} caption(s) exceed ${s.maxChars} characters`;
                const paceStatus = summary.tooFast === 0 ?
                    '✅ Reading speed within range' :
                    `⚠️ ${summary.tooFast} caption(s) exceed ${s.maxReadingSpeed} chars/sec`;
                const briefStatus = summary.tooBrief === 0 && summary.tooLongDuration === 0 ?
                    '✅ All captions within screen time range' :
                    `⚠️ ${summary.tooBrief} under ${s.minDuration}s, ${summary.tooLongDuration} over ${s.maxDuration}s on screen`;

                qualityContent.innerHTML = `
                    <strong>${currentFile.name}:</strong> ${summary.totalCaptions} captions generated<br>
                    <strong>Text validation:</strong> ${textMatchStatus}<br>
                    <strong>Length compliance:</strong> ${lengthStatus}<br>
                    <strong>Reading speed:</strong> ${paceStatus} (avg ${summary.avgReadingSpeed.toFixed(1)}, peak ${summary.maxReadingSpeed.toFixed(1)} chars/sec)<br>
                    <strong>Screen time:</strong> ${briefStatus}<br>
                    <strong>Average length:</strong> ${summary.avgLength} characters
                `;

                // Update details with aligned column format
                const qualityDetails = document.getElementById('qualityDetails');
                let detailsContent = `CAPTION-BY-CAPTION ANALYSIS:\n\n`;

                // Find the longest caption text to determine padding
                const maxTextLength = Math.max(...summary.captionAnalysis.map(cap => cap.text.length));
                const columnWidth = Math.min(maxTextLength + 5, 80); // Cap at 80 chars for readability

                summary.captionAnalysis.forEach(cap => {
                    const status = cap.issues.length > 0 ? '❌' : '✅';
                    const paddedText = `"${cap.text}"`.padEnd(columnWidth);
                    const issueNote = cap.issues.length > 0 ? `  [${cap.issues.map(i => i.type).join(', ')}]` : '';
                    detailsContent += `#${String(cap.index).padStart(3)} ${paddedText} ${status} ${cap.length}ch  ${cap.duration.toFixed(2)}s  ${cap.cps.toFixed(1)}cps${issueNote}\n`;
                });

                detailsContent += `\n\nSUMMARY (current settings: max ${s.maxChars} chars, target ${s.targetChars} chars, ${s.minDuration}-${s.maxDuration}s on screen, max ${s.maxReadingSpeed} chars/sec, break on pauses >${s.pauseThreshold}s):\n`;
                detailsContent += `• Within ${s.maxChars}-char limit: ${summary.totalCaptions - summary.tooLong}/${summary.totalCaptions}\n`;
                detailsContent += `• Too long (>${s.maxChars} chars): ${summary.tooLong}/${summary.totalCaptions}\n`;
                detailsContent += `• Below minimum screen time (<${s.minDuration}s): ${summary.tooBrief}/${summary.totalCaptions}\n`;
                detailsContent += `• Above maximum screen time (>${s.maxDuration}s, could not be split further): ${summary.tooLongDuration}/${summary.totalCaptions}\n`;
                detailsContent += `• Reading too fast (>${s.maxReadingSpeed} chars/sec): ${summary.tooFast}/${summary.totalCaptions}\n`;
                detailsContent += `• Very short text (<10 chars, possible bad split): ${summary.shortCaptions}/${summary.totalCaptions}\n`;
                detailsContent += `• Average length: ${summary.avgLength} characters\n`;
                detailsContent += `• Average reading speed: ${summary.avgReadingSpeed.toFixed(1)} chars/sec (peak ${summary.maxReadingSpeed.toFixed(1)})\n\n`;

                detailsContent += `TEXT VALIDATION:\n`;
                detailsContent += `• Character difference: ${summary.textMatched.charDiff} (${summary.textMatched.originalLength} original vs ${summary.textMatched.reconstructedLength} generated chars)\n`;
                detailsContent += `• Word count difference: ${summary.textMatched.wordDiff} (${summary.textMatched.originalWordCount} original vs ${summary.textMatched.reconstructedWordCount} generated words)\n`;
                if (summary.textMatched.mismatchContext) {
                    const captionNote = summary.textMatched.mismatchCaptionIndex ? ` (caption #${summary.textMatched.mismatchCaptionIndex})` : '';
                    detailsContent += `• First divergence near word ${summary.textMatched.mismatchContext.wordIndex + 1}${captionNote}:\n`;
                    detailsContent += `    Original:  "...${summary.textMatched.mismatchContext.original}..."\n`;
                    detailsContent += `    Generated: "...${summary.textMatched.mismatchContext.reconstructed}..."\n`;
                } else {
                    detailsContent += `• No word-level divergence found in the overlapping portion.\n`;
                }

                const flagged = summary.captionAnalysis.filter(c => c.issues.length > 0);
                if (flagged.length > 0) {
                    detailsContent += `\nFLAGGED CAPTIONS (${flagged.length}):\n`;
                    flagged.forEach(cap => {
                        detailsContent += `• #${cap.index}: ${cap.issues.map(i => i.label).join('; ')}\n`;
                    });
                }

                qualityDetails.textContent = detailsContent;
            },


            toggleQualityDetails() {
                const qualityDetails = document.getElementById('qualityDetails');
                const toggleBtn = document.getElementById('qualityToggle');
                
                if (qualityDetails.style.display === 'none') {
                    qualityDetails.style.display = 'block';
                    toggleBtn.textContent = 'Hide Details';
                } else {
                    qualityDetails.style.display = 'none';
                    toggleBtn.textContent = 'Show Details';
                }
            },


            showMessage(text, type = 'info') {
                const messageContainer = document.getElementById('messageContainer');
                const message = document.createElement('div');
                message.className = `message ${type}`;
                message.textContent = text;

                messageContainer.appendChild(message);

                // Added and immediately made visible in the same tick would never
                // paint the initial opacity:0 - the transition needs a frame to
                // actually happen, so the fade-in is queued for the next one.
                requestAnimationFrame(() => {
                    message.classList.add('visible');
                });

                const remove = () => {
                    if (message.parentNode) {
                        message.parentNode.removeChild(message);
                    }
                };

                setTimeout(() => {
                    message.classList.remove('visible');
                    message.addEventListener('transitionend', remove, { once: true });
                    // Fallback in case transitionend never fires for some reason
                    // (backgrounded tab, etc.) so the message doesn't linger.
                    setTimeout(remove, 400);
                }, 5000);
            },


            cleanup() {
                this.audioUrls.forEach(url => URL.revokeObjectURL(url));
                this.audioUrls.clear();
            },


            // Captions only live in memory until explicitly downloaded (auto-save
            // keeps edits in this.transcripts, not on disk), so any processed batch
            // represents API cost/time that closing the tab would lose silently.
            hasUnsavedWork() {
                return this.transcripts.size > 0;
            },


            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            },


            // Smoothly scrolls an element into view, offsetting for the sticky
            // header's height so it doesn't end up hidden underneath it - used by
            // the "Show Tuning Settings" shortcut near Regenerate, which jumps up
            // to the one actual tuning section near the Generate button rather
            // than duplicating those fields down here.
            scrollToElementBelowHeader(el) {
                const header = document.querySelector('.header');
                const headerHeight = header ? header.getBoundingClientRect().height : 0;
                const rect = el.getBoundingClientRect();
                const targetY = window.scrollY + rect.top - headerHeight - 12;
                window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
            },


            // Only disabled when there are no files - missing/invalid API keys are
            // still clickable, since handleProcessClick opens Settings and points at
            // the specific missing key rather than leaving the user to guess why a
            // disabled button won't respond.
            updateProcessButton() {
                const status = this.getRequiredApiKeyStatus();
                const hasFiles = this.files.length > 0;
                const processBtn = document.getElementById('processBtn');

                processBtn.disabled = !hasFiles;

                if (!hasFiles) {
                    processBtn.textContent = '📁 Select Audio Files First';
                } else if (!status.openaiOk && !status.elevenlabsOk) {
                    processBtn.textContent = '🔑 Add API Keys in Settings';
                } else if (!status.openaiOk) {
                    processBtn.textContent = '🔑 Add OpenAI API Key in Settings';
                } else if (!status.elevenlabsOk) {
                    processBtn.textContent = '🔑 Add ElevenLabs API Key in Settings';
                } else {
                    processBtn.textContent = '🚀 Generate Professional Captions';
                }
            }
};
