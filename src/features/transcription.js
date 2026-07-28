export const transcriptionMethods = {

            // Prepares any audio or video file for transcription: decodes and
            // downsamples its audio track (via Web Audio, at CPU decode speed rather
            // than playback speed) into mono 16kHz WAV, then splits it into as many
            // chunks as needed to stay under maxBytes for the selected provider's
            // per-request upload limit. Returns an array of { file, offset } - offset
            // (seconds) is added to that chunk's word/segment timestamps after
            // transcription so caption timing stays continuous.
            //
            // Falls back to real-time <video> playback extraction if fast decoding fails
            // for a video file (e.g. unsupported container/codec combo), or to uploading
            // the original file unchanged as a last resort for anything else.
            async prepareAudioForTranscription(file, maxBytes) {
                let buffer;
                try {
                    buffer = await this.decodeToMonoBuffer(file);
                } catch (error) {
                    this.logMessage(`⚠️ Fast audio decode failed (${error.message})`, 'warning');

                    if (this.isVideoFile(file)) {
                        this.logMessage(`🎬 Falling back to real-time video audio extraction...`, 'plain');
                        const extracted = await this.extractAudioRealtime(file);
                        try {
                            buffer = await this.decodeToMonoBuffer(extracted);
                        } catch (decodeError) {
                            this.logMessage(`⚠️ Could not decode extracted audio for chunking - uploading as a single file`, 'warning');
                            return [{ file: extracted, offset: 0 }];
                        }
                    } else {
                        this.logMessage(`⚠️ Uploading original file as-is (no compression/chunking possible)`, 'warning');
                        return [{ file, offset: 0 }];
                    }
                }

                return this.splitBufferIntoChunks(buffer, file.name, maxBytes);
            },


            // Decodes a file's audio track and resamples it to mono 16kHz.
            async decodeToMonoBuffer(file) {
                const arrayBuffer = await file.arrayBuffer();

                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) {
                    throw new Error('Web Audio API not supported in this browser');
                }

                const audioContext = new AudioContextClass();
                let decodedBuffer;
                try {
                    decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
                } finally {
                    audioContext.close();
                }

                if (!decodedBuffer || decodedBuffer.length === 0) {
                    throw new Error('No audio track could be decoded from this file');
                }

                // Downmix to mono and downsample to 16kHz - Whisper resamples to this anyway,
                // and it keeps the exported WAV small (helps stay under the API's 25MB limit).
                const targetSampleRate = 16000;
                const offlineContext = new OfflineAudioContext(
                    1,
                    Math.ceil(decodedBuffer.duration * targetSampleRate),
                    targetSampleRate
                );
                const source = offlineContext.createBufferSource();
                source.buffer = decodedBuffer;
                source.connect(offlineContext.destination);
                source.start();

                return await offlineContext.startRendering();
            },


            // Splits a decoded mono/16kHz AudioBuffer into WAV chunks that each stay
            // under maxBytes, with headroom to spare. maxBytes should already include
            // whatever safety margin the caller wants under the provider's actual
            // upload limit.
            splitBufferIntoChunks(buffer, originalFileName, maxBytes) {
                const SAFE_MAX_BYTES = maxBytes;
                const bytesPerSecond = buffer.sampleRate * 2 * buffer.numberOfChannels; // 16-bit PCM
                const maxChunkSeconds = Math.floor((SAFE_MAX_BYTES - 44) / bytesPerSecond);
                const baseName = originalFileName.replace(/\.[^/.]+$/, '');

                if (buffer.duration <= maxChunkSeconds) {
                    const wavBlob = this.audioBufferToWavBlob(buffer);
                    const chunkFile = new File([wavBlob], `${baseName}.wav`, { type: 'audio/wav' });
                    return [{ file: chunkFile, offset: 0, duration: buffer.duration }];
                }

                const chunkSamples = maxChunkSeconds * buffer.sampleRate;
                const chunks = [];
                let startSample = 0;
                let chunkIndex = 0;

                while (startSample < buffer.length) {
                    const endSample = Math.min(startSample + chunkSamples, buffer.length);
                    const length = endSample - startSample;

                    const chunkBuffer = new AudioBuffer({
                        length,
                        numberOfChannels: buffer.numberOfChannels,
                        sampleRate: buffer.sampleRate
                    });

                    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                        chunkBuffer.copyToChannel(buffer.getChannelData(ch).subarray(startSample, endSample), ch);
                    }

                    const wavBlob = this.audioBufferToWavBlob(chunkBuffer);
                    const chunkFile = new File([wavBlob], `${baseName}.part${chunkIndex + 1}.wav`, { type: 'audio/wav' });

                    chunks.push({
                        file: chunkFile,
                        offset: startSample / buffer.sampleRate,
                        duration: length / buffer.sampleRate
                    });

                    startSample = endSample;
                    chunkIndex++;
                }

                this.logMessage(`🎬 Audio split into ${chunks.length} chunks to stay under the API's upload limit`, 'plain');

                return chunks;
            },


            // Transcribes one or more audio chunks via the selected provider and
            // merges the results into a single normalized-shape object, offsetting
            // each chunk's word/segment timestamps so downstream caption timing
            // stays continuous across chunks.
            async transcribeChunks(chunks, provider, apiKey) {
                const transcribeOne = (file) => provider === 'elevenlabs'
                    ? this.transcribeWithElevenLabs(file, apiKey)
                    : this.transcribeWithWhisper(file, apiKey);

                if (chunks.length === 1) {
                    return await transcribeOne(chunks[0].file);
                }

                let combinedText = '';
                const combinedWords = [];
                const combinedSegments = [];

                for (let i = 0; i < chunks.length; i++) {
                    const { file: chunkFile, offset } = chunks[i];
                    this.logMessage(`🎯 Transcribing chunk ${i + 1}/${chunks.length}...`, 'plain');

                    const result = await transcribeOne(chunkFile);

                    combinedText += (combinedText ? ' ' : '') + result.text;

                    (result.words || []).forEach(w => {
                        combinedWords.push({ ...w, start: w.start + offset, end: w.end + offset });
                    });

                    (result.segments || []).forEach(s => {
                        combinedSegments.push({ ...s, start: s.start + offset, end: s.end + offset });
                    });
                }

                const lastChunk = chunks[chunks.length - 1];

                return {
                    text: combinedText,
                    words: combinedWords,
                    segments: combinedSegments,
                    duration: lastChunk.offset + (lastChunk.duration || 0)
                };
            },


            // Encodes an AudioBuffer as a 16-bit PCM WAV Blob.
            audioBufferToWavBlob(buffer) {
                const numChannels = buffer.numberOfChannels;
                const sampleRate = buffer.sampleRate;
                const numFrames = buffer.length;
                const bytesPerSample = 2;
                const blockAlign = numChannels * bytesPerSample;
                const dataSize = numFrames * blockAlign;
                const bufferSize = 44 + dataSize;

                const arrayBuffer = new ArrayBuffer(bufferSize);
                const view = new DataView(arrayBuffer);

                const writeString = (offset, str) => {
                    for (let i = 0; i < str.length; i++) {
                        view.setUint8(offset + i, str.charCodeAt(i));
                    }
                };

                writeString(0, 'RIFF');
                view.setUint32(4, bufferSize - 8, true);
                writeString(8, 'WAVE');
                writeString(12, 'fmt ');
                view.setUint32(16, 16, true);
                view.setUint16(20, 1, true);
                view.setUint16(22, numChannels, true);
                view.setUint32(24, sampleRate, true);
                view.setUint32(28, sampleRate * blockAlign, true);
                view.setUint16(32, blockAlign, true);
                view.setUint16(34, bytesPerSample * 8, true);
                writeString(36, 'data');
                view.setUint32(40, dataSize, true);

                const channelData = [];
                for (let ch = 0; ch < numChannels; ch++) {
                    channelData.push(buffer.getChannelData(ch));
                }

                let offset = 44;
                for (let i = 0; i < numFrames; i++) {
                    for (let ch = 0; ch < numChannels; ch++) {
                        const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
                        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                        offset += 2;
                    }
                }

                return new Blob([arrayBuffer], { type: 'audio/wav' });
            },


            async extractAudioRealtime(videoFile) {
                return new Promise((resolve, reject) => {
                    const video = document.createElement('video');
                    video.muted = true;
                    video.style.display = 'none';

                    const cleanup = () => {
                        if (video.parentNode) {
                            document.body.removeChild(video);
                        }
                        URL.revokeObjectURL(video.src);
                    };

                    // First, we need to get the video duration to set appropriate timeout
                    video.onloadedmetadata = () => {
                        try {
                            const videoDuration = video.duration;
                            
                            if (videoDuration === 0 || !isFinite(videoDuration)) {
                                cleanup();
                                reject(new Error('Video file appears to be empty or corrupted'));
                                return;
                            }

                            // Set timeout based on video duration: duration + 60s buffer (minimum 120s)
                            const timeoutDuration = Math.max((videoDuration + 60) * 1000, 120000);
                            this.logMessage(`🎬 Video duration: ${Math.round(videoDuration)}s - Setting ${Math.round(timeoutDuration/1000)}s timeout`, 'plain');

                            const timeoutId = setTimeout(() => {
                                cleanup();
                                reject(new Error(`Audio extraction timeout after ${Math.round(timeoutDuration/1000)}s. Video may be too long or corrupted.`));
                            }, timeoutDuration);

                            // Capture the media stream from video
                            let stream;
                            try {
                                stream = video.captureStream();
                            } catch (err) {
                                clearTimeout(timeoutId);
                                cleanup();
                                reject(new Error('Browser does not support video stream capture. Try using Chrome/Edge.'));
                                return;
                            }

                            const audioTracks = stream.getAudioTracks();
                            if (audioTracks.length === 0) {
                                clearTimeout(timeoutId);
                                cleanup();
                                reject(new Error('Video file contains no audio track'));
                                return;
                            }

                            // Create audio-only stream
                            const audioStream = new MediaStream(audioTracks);
                            
                            // Set up recorder with optimal settings for Whisper
                            const options = {
                                mimeType: 'audio/webm;codecs=opus',
                                audioBitsPerSecond: 64000 // Good quality but small size
                            };

                            // Fallback if webm/opus not supported
                            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                                options.mimeType = 'audio/webm';
                                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                                    options.mimeType = 'audio/mp4';
                                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                                        clearTimeout(timeoutId);
                                        cleanup();
                                        reject(new Error('Browser does not support audio recording. Try using Chrome/Edge.'));
                                        return;
                                    }
                                }
                            }

                            const mediaRecorder = new MediaRecorder(audioStream, options);
                            const audioChunks = [];
                            let recordingStartTime = Date.now();
                            let lastProgressUpdate = 0;

                            mediaRecorder.ondataavailable = (event) => {
                                if (event.data.size > 0) {
                                    audioChunks.push(event.data);
                                }
                                
                                // Progress updates every 10 seconds
                                const currentTime = video.currentTime;
                                if (currentTime - lastProgressUpdate >= 10) {
                                    const progress = Math.round((currentTime / videoDuration) * 100);
                                    const timeRemaining = Math.round(videoDuration - currentTime);
                                    this.logMessage(`🎬 Audio extraction progress: ${progress}% (${timeRemaining}s remaining)`, 'plain');
                                    lastProgressUpdate = currentTime;
                                }
                            };

                            mediaRecorder.onstop = () => {
                                clearTimeout(timeoutId);
                                
                                if (audioChunks.length === 0) {
                                    cleanup();
                                    reject(new Error('No audio data captured from video'));
                                    return;
                                }

                                // Create the audio blob
                                const audioBlob = new Blob(audioChunks, { 
                                    type: options.mimeType.split(';')[0] 
                                });

                                // Create a File object that mimics the original
                                const audioFile = new File([audioBlob], 
                                    videoFile.name.replace(/\.[^/.]+$/, '.webm'), 
                                    { type: audioBlob.type }
                                );

                                cleanup();
                                resolve(audioFile);
                            };

                            mediaRecorder.onerror = (event) => {
                                clearTimeout(timeoutId);
                                cleanup();
                                reject(new Error(`Audio recording failed: ${event.error?.message || 'Unknown error'}`));
                            };

                            // Start the process
                            video.currentTime = 0;
                            mediaRecorder.start(1000); // Collect data every second
                            
                            this.logMessage(`🎬 Starting audio extraction (runs at real-time: ~${Math.round(videoDuration)}s)`, 'plain');
                            
                            // Play video to trigger audio capture
                            video.play().catch(err => {
                                clearTimeout(timeoutId);
                                cleanup();
                                reject(new Error(`Failed to play video: ${err.message}`));
                            });

                            // Stop recording when video ends
                            video.onended = () => {
                                if (mediaRecorder.state === 'recording') {
                                    mediaRecorder.stop();
                                }
                            };

                        } catch (error) {
                            cleanup();
                            reject(new Error(`Audio extraction setup failed: ${error.message}`));
                        }
                    };

                    video.onerror = () => {
                        cleanup();
                        reject(new Error('Failed to load video file. Ensure it\'s a valid video format.'));
                    };

                    // Load the video to get metadata
                    document.body.appendChild(video);
                    video.src = URL.createObjectURL(videoFile);
                    video.load();
                });
            },


            async transcribeWithWhisper(file, apiKey) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('model', 'whisper-1');
                formData.append('response_format', 'verbose_json');
                formData.append('language', 'en');
                formData.append('timestamp_granularities[]', 'word');

                // Add technical terms to guide Whisper's transcription
                const technicalTerms = this.getTechnicalTerms();
                if (technicalTerms.length > 0) {
                    const whisperPrompt = `Technical terms including: ${technicalTerms.join(', ')}. Please transcribe accurately with proper spelling of these technical terms.`;
                    formData.append('prompt', whisperPrompt);
                }

                // Whisper calls are the expensive, hard-to-recover-from step (a failure
                // here fails the whole file, discarding any earlier chunks already
                // transcribed for it) - so transient failures get a few retries instead
                // of failing immediately. formData is safe to reuse across attempts;
                // it just references the File, it doesn't consume a stream.
                const maxAttempts = 3;

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    let response;
                    try {
                        response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${apiKey}`
                            },
                            body: formData
                        });
                    } catch (networkError) {
                        // fetch() itself rejected - offline, DNS failure, connection reset, etc.
                        if (attempt < maxAttempts) {
                            await this.waitBeforeRetry(null, attempt, networkError.message);
                            continue;
                        }
                        throw new Error(`Network error contacting Whisper API: ${networkError.message}`);
                    }

                    if (!response.ok) {
                        const errorText = await response.text();
                        let errorMessage = 'Transcription failed';

                        try {
                            const errorData = JSON.parse(errorText);
                            errorMessage = errorData.error?.message || errorMessage;
                        } catch (e) {
                            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                        }

                        const isRetryable = response.status === 429 || response.status >= 500;
                        if (isRetryable && attempt < maxAttempts) {
                            await this.waitBeforeRetry(response, attempt, errorMessage);
                            continue;
                        }

                        throw new Error(errorMessage);
                    }

                    const result = await response.json();

                    if (!result?.text) {
                        throw new Error('No transcription text received from Whisper API');
                    }

                    // Create fallback segments if none provided
                    if (!result.segments || result.segments.length === 0) {
                        result.segments = this.createFallbackSegments(result.text, result.duration || 30);
                    }

                    return result;
                }
            },


            // Waits before retrying a failed request, honoring the API's Retry-After
            // header when present, otherwise a short exponential backoff (1s, 2s...).
            // Logs so retries are visible in the processing log rather than silent.
            async waitBeforeRetry(response, attempt, reason, providerLabel = 'Whisper') {
                let delayMs = 1000 * Math.pow(2, attempt - 1);

                const retryAfter = response?.headers.get('Retry-After');
                if (retryAfter) {
                    const seconds = parseFloat(retryAfter);
                    if (!isNaN(seconds)) {
                        delayMs = seconds * 1000;
                    }
                }

                this.logMessage(`⚠️ ${providerLabel} request failed (${reason}) - retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/3)...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, delayMs));
            },


            // Transcribes via ElevenLabs Scribe instead of Whisper. Normalizes the
            // result to the exact same shape transcribeWithWhisper returns
            // ({text, words: [{word, start, end}], segments, duration}) so nothing
            // downstream (chunk offsetting, caption generation, regenerate caching)
            // needs to know which provider ran.
            async transcribeWithElevenLabs(file, apiKey) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('model_id', 'scribe_v2');
                formData.append('timestamps_granularity', 'word');
                formData.append('language_code', 'en');

                // ElevenLabs' equivalent of Whisper's technical-terms prompt: a list
                // of terms to bias recognition toward, rather than a free-text prompt.
                // The exact multipart array field-naming convention for `keyterms`
                // isn't verified against a live request - if terms don't appear to
                // improve recognition, check this against ElevenLabs' current docs.
                const technicalTerms = this.getTechnicalTerms();
                technicalTerms.slice(0, 1000).forEach(term => {
                    formData.append('keyterms[]', term.slice(0, 50));
                });

                const maxAttempts = 3;

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    let response;
                    try {
                        response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
                            method: 'POST',
                            headers: {
                                'xi-api-key': apiKey
                            },
                            body: formData
                        });
                    } catch (networkError) {
                        if (attempt < maxAttempts) {
                            await this.waitBeforeRetry(null, attempt, networkError.message, 'ElevenLabs');
                            continue;
                        }
                        throw new Error(`Network error contacting ElevenLabs API: ${networkError.message}`);
                    }

                    if (!response.ok) {
                        const errorText = await response.text();
                        let errorMessage = 'Transcription failed';

                        try {
                            const errorData = JSON.parse(errorText);
                            errorMessage = errorData.detail?.message || errorData.detail || errorData.message || errorMessage;
                        } catch (e) {
                            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                        }

                        const isRetryable = response.status === 429 || response.status >= 500;
                        if (isRetryable && attempt < maxAttempts) {
                            await this.waitBeforeRetry(response, attempt, errorMessage, 'ElevenLabs');
                            continue;
                        }

                        throw new Error(errorMessage);
                    }

                    const raw = await response.json();

                    if (!raw?.text) {
                        throw new Error('No transcription text received from ElevenLabs API');
                    }

                    // ElevenLabs returns word/spacing/audio_event entries mixed
                    // together - keep only actual words, and rename text -> word to
                    // match Whisper's field name.
                    const words = (raw.words || [])
                        .filter(w => w.type === 'word' && typeof w.start === 'number' && typeof w.end === 'number')
                        .map(w => ({ word: w.text, start: w.start, end: w.end }));

                    const duration = words.length > 0 ? words[words.length - 1].end : 0;

                    const result = {
                        text: raw.text,
                        words,
                        duration,
                        segments: this.createFallbackSegments(raw.text, duration || 30)
                    };

                    return result;
                }
            },


            createFallbackSegments(text, duration) {
                const sentences = text.split(/[.!?]+/).filter(s => s.trim());
                const segmentDuration = duration / Math.max(sentences.length, 1);
                
                return sentences.map((sentence, index) => ({
                    start: index * segmentDuration,
                    end: (index + 1) * segmentDuration,
                    text: sentence.trim()
                })).filter(seg => seg.text);
            }
};
