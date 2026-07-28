export const exportDownloadMethods = {

            generateSRT(captions) {
                return captions.map(caption => {
                    const startTime = this.formatSRTTime(caption.start);
                    const endTime = this.formatSRTTime(caption.end);
                    return `${caption.index}\n${startTime} --> ${endTime}\n${caption.text}\n`;
                }).join('\n');
            },


            formatSRTTime(seconds) {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = Math.floor(seconds % 60);
                const ms = Math.floor((seconds % 1) * 1000);

                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
            },


            // WebVTT: same structure as SRT plus a "WEBVTT" header, and a "." instead
            // of "," before milliseconds. Many LMS/SCORM players expect this over SRT.
            generateVTT(captions) {
                const cues = captions.map(caption => {
                    const startTime = this.formatVTTTime(caption.start);
                    const endTime = this.formatVTTTime(caption.end);
                    return `${caption.index}\n${startTime} --> ${endTime}\n${caption.text}\n`;
                }).join('\n');

                return `WEBVTT\n\n${cues}`;
            },


            formatVTTTime(seconds) {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = Math.floor(seconds % 60);
                const ms = Math.floor((seconds % 1) * 1000);

                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
            },


            getSelectedCaptionFormat() {
                const select = document.getElementById('downloadFormat');
                return select && select.value === 'vtt' ? 'vtt' : 'srt';
            },


            generateCaptionFile(captions, format) {
                return format === 'vtt' ? this.generateVTT(captions) : this.generateSRT(captions);
            },


            async downloadCurrentCaptions() {
                const currentFile = this.files[this.currentFileIndex];

                if (!this.transcripts.has(currentFile.name) || this.currentCaptions.length === 0) {
                    this.showMessage('No captions available for current file.', 'error');
                    return;
                }

                // Uses this.currentCaptions (live, auto-saved edits for the active
                // file) rather than the original transcript, so any in-editor
                // changes are always reflected in the download.
                const format = this.getSelectedCaptionFormat();
                const content = this.generateCaptionFile(this.currentCaptions, format);
                const filename = `${currentFile.name.replace(/\.[^/.]+$/, '')}.${format}`;
                const result = await this.downloadFile(content, filename, this.captionSaveDirectoryHandle);
                if (result.savedToFolder) {
                    this.showMessage(`Saved "${filename}" to "${result.folderName}".`, 'success');
                }
            },


            async downloadTranscript() {
                const currentFile = this.files[this.currentFileIndex];
                const captions = this.transcripts.get(currentFile.name);

                if (!captions) {
                    this.showMessage('No transcript available for current file.', 'error');
                    return;
                }

                const content = captions.map(caption => caption.text).join(' ');
                const filename = currentFile.name.replace(/\.[^/.]+$/, '') + '_transcript.txt';
                const result = await this.downloadFile(content, filename, this.captionSaveDirectoryHandle);
                if (result.savedToFolder) {
                    this.showMessage(`Saved "${filename}" to "${result.folderName}".`, 'success');
                }
            },


            async downloadAllCaptions() {
                if (this.transcripts.size === 0) {
                    this.showMessage('No transcripts available.', 'error');
                    return;
                }

                const format = this.getSelectedCaptionFormat();
                const totalFiles = this.transcripts.size;
                this.showMessage(`Starting download of ${totalFiles} ${format.toUpperCase()} files...`, 'info');

                // Disable the download button during batch download
                const downloadBtn = document.getElementById('downloadAll');
                const originalText = downloadBtn.textContent;
                downloadBtn.disabled = true;

                let downloadCount = 0;
                let savedFolderName = null;
                const fileEntries = Array.from(this.transcripts.entries());

                try {
                    for (const [fileName, captions] of fileEntries) {
                        downloadCount++;

                        // Update button with progress
                        downloadBtn.textContent = `📥 Downloading ${downloadCount}/${totalFiles}...`;

                        const content = this.generateCaptionFile(captions, format);
                        const outFileName = `${fileName.replace(/\.[^/.]+$/, '')}.${format}`;

                        const result = await this.downloadFile(content, outFileName, this.captionSaveDirectoryHandle);
                        if (result.savedToFolder) {
                            savedFolderName = result.folderName;
                        }

                        // Add delay between downloads to avoid browser limits
                        // Shorter delay for first 10, longer delay for remaining
                        const delay = downloadCount <= 10 ? 200 : 1000;
                        if (downloadCount < totalFiles) {
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                    }

                    this.showMessage(
                        savedFolderName
                            ? `✅ Saved all ${totalFiles} ${format.toUpperCase()} files to "${savedFolderName}"!`
                            : `✅ Successfully initiated download of all ${totalFiles} ${format.toUpperCase()} files!`,
                        'success'
                    );

                } catch (error) {
                    console.error('Error during batch download:', error);
                    this.showMessage(`⚠️ Download completed with issues. ${downloadCount}/${totalFiles} files processed.`, 'warning');
                } finally {
                    // Re-enable button
                    downloadBtn.disabled = false;
                    downloadBtn.textContent = originalText;
                }
            },


            // Bundles current settings, cached transcriptions, generated captions,
            // quality data, and the processing log into one JSON file - meant to be
            // handed over for troubleshooting instead of describing the problem
            // secondhand. Deliberately never includes API key values, only whether
            // one is set - safe to share.
            async exportDebugInfo() {
                const settings = this.getCaptionSettings();

                const files = this.files.map(file => {
                    const whisperResult = this.whisperResults.get(file.name) || null;
                    return {
                        fileName: file.name,
                        fileSizeBytes: file.size,
                        fileType: file.type,
                        transcription: whisperResult ? {
                            text: whisperResult.text,
                            words: whisperResult.words,
                            segments: whisperResult.segments,
                            duration: whisperResult.duration
                        } : null,
                        captions: this.transcripts.get(file.name) || null,
                        qualitySummary: this.qualityData.get(file.name) || null,
                        processingTimes: this.processingTimes.get(file.name) || null
                    };
                });

                const debugInfo = {
                    exportedAt: new Date().toISOString(),
                    page: {
                        url: location.href,
                        userAgent: navigator.userAgent,
                        language: navigator.language,
                        supportsFileSystemAccess: this.supportsFileSystemAccess
                    },
                    settings: {
                        ...settings,
                        transcriptionProvider: document.getElementById('settingTranscriptionProvider').value,
                        downloadFormat: document.getElementById('downloadFormat').value,
                        technicalTerms: this.getTechnicalTerms(),
                        theme: document.documentElement.getAttribute('data-theme') || null
                    },
                    apiKeys: {
                        openaiKeyConfigured: document.getElementById('apiKey').value.trim().length > 0,
                        elevenlabsKeyConfigured: document.getElementById('elevenlabsApiKey').value.trim().length > 0
                        // Values are never included here on purpose.
                    },
                    saveLocations: {
                        captions: this.captionSaveDirectoryHandle ? this.captionSaveDirectoryHandle.name : null,
                        debug: this.debugSaveDirectoryHandle ? this.debugSaveDirectoryHandle.name : null
                    },
                    files,
                    processingLog: document.getElementById('progressLog')?.textContent || ''
                };

                const content = JSON.stringify(debugInfo, null, 2);
                const filename = `caption-generator-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                const result = await this.downloadFile(content, filename, this.debugSaveDirectoryHandle);
                this.showMessage(
                    result.savedToFolder
                        ? `Debug info saved to "${result.folderName}". Safe to share - it never includes API key values.`
                        : 'Debug info exported. Safe to share - it never includes API key values.',
                    'success'
                );
            },


            // Writes directly into directoryHandle if one is given and still
            // accessible; otherwise (or if that fails for any reason) falls back to
            // the normal browser download via a Blob URL + <a download>. Returns
            // { savedToFolder, folderName } so callers can confirm exactly where
            // the file ended up.
            async downloadFile(content, filename, directoryHandle) {
                if (directoryHandle) {
                    try {
                        const permission = await this.ensureDirectoryPermission(directoryHandle);
                        if (permission === 'granted') {
                            const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
                            const writable = await fileHandle.createWritable();
                            await writable.write(content);
                            await writable.close();
                            return { savedToFolder: true, folderName: directoryHandle.name };
                        }
                    } catch (error) {
                        console.error(`Could not save "${filename}" to the chosen folder, falling back to a normal download:`, error);
                        this.showMessage(`Could not save to the chosen folder - using a normal download instead.`, 'warning');
                    }
                }

                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                return { savedToFolder: false, folderName: null };
            }
};
