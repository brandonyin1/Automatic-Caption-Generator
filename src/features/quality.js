export const qualityMethods = {

            // Single source of truth for "is this caption a problem" - used by both
            // the quality summary and the per-card warning badges, so the two never
            // disagree about which captions are flagged or why.
            evaluateCaptionIssues(caption, settings, context = {}) {
                const issues = [];
                const length = caption.text.length;
                const duration = caption.end - caption.start;
                const cps = duration > 0 ? length / duration : Infinity;

                if (length > settings.maxChars) {
                    issues.push({ type: 'TOO_LONG', label: `Too long: ${length} chars (max ${settings.maxChars})` });
                }
                if (length < 10) {
                    issues.push({ type: 'SHORT_TEXT', label: `Very short text: ${length} chars - check for a bad split` });
                }
                if (duration < settings.minDuration) {
                    issues.push({ type: 'TOO_BRIEF', label: `On screen ${duration.toFixed(2)}s (min ${settings.minDuration}s)` });
                }
                if (duration > settings.maxDuration) {
                    issues.push({ type: 'TOO_LONG_DURATION', label: `On screen ${duration.toFixed(2)}s (max ${settings.maxDuration}s) - could not be split further` });
                }
                if (isFinite(cps) && cps > settings.maxReadingSpeed) {
                    issues.push({ type: 'TOO_FAST', label: `Reads at ${cps.toFixed(1)} chars/sec (max ${settings.maxReadingSpeed})` });
                }

                // Text validation issues: how well this caption's text is trusted
                // to match what was actually said.
                if (caption.approximated) {
                    issues.push({ type: 'TEXT_APPROXIMATED', label: 'Timing is approximated - this text could not be matched to the audio at all; verify manually' });
                } else if (typeof caption.matchConfidence === 'number' && caption.matchConfidence < 0.95) {
                    const pct = Math.round(caption.matchConfidence * 100);
                    issues.push({ type: 'TEXT_UNCERTAIN', label: `Text match uncertain (${pct}% word confidence) - verify against audio` });
                }
                if (context.mismatchCaptionIndex === caption.index) {
                    issues.push({ type: 'TEXT_DIVERGENCE', label: 'Near the first point where generated text diverges from the original transcript' });
                }

                return issues;
            },


            generateQualitySummary(fileName, captions, originalTranscript) {
                const settings = this.getCaptionSettings();
                const textMatched = this.validateTextMatch(captions, originalTranscript);
                const mismatchCaptionIndex = textMatched.mismatchContext
                    ? this.findCaptionIndexForWordPosition(captions, textMatched.mismatchContext.wordIndex)
                    : null;
                textMatched.mismatchCaptionIndex = mismatchCaptionIndex;

                const context = { mismatchCaptionIndex };
                const captionAnalysis = captions.map((c, i) => {
                    const duration = c.end - c.start;
                    return {
                        index: i + 1,
                        length: c.text.length,
                        text: c.text,
                        duration,
                        cps: duration > 0 ? c.text.length / duration : 0,
                        issues: this.evaluateCaptionIssues(c, settings, context)
                    };
                });

                const tooLong = captionAnalysis.filter(c => c.issues.some(i => i.type === 'TOO_LONG')).length;
                const tooBrief = captionAnalysis.filter(c => c.issues.some(i => i.type === 'TOO_BRIEF')).length;
                const tooLongDuration = captionAnalysis.filter(c => c.issues.some(i => i.type === 'TOO_LONG_DURATION')).length;
                const tooFast = captionAnalysis.filter(c => c.issues.some(i => i.type === 'TOO_FAST')).length;
                const shortText = captionAnalysis.filter(c => c.issues.some(i => i.type === 'SHORT_TEXT')).length;
                const textFlagged = captionAnalysis.filter(c => c.issues.some(i => i.type === 'TEXT_UNCERTAIN' || i.type === 'TEXT_DIVERGENCE')).length;
                const cpsValues = captionAnalysis.map(c => c.cps).filter(v => isFinite(v));

                const summary = {
                    totalCaptions: captions.length,
                    avgLength: Math.round(captions.reduce((sum, c) => sum + c.text.length, 0) / captions.length),
                    tooLong,
                    tooBrief,
                    tooLongDuration,
                    tooFast,
                    shortCaptions: shortText,
                    textFlagged,
                    avgReadingSpeed: cpsValues.length ? cpsValues.reduce((a, b) => a + b, 0) / cpsValues.length : 0,
                    maxReadingSpeed: cpsValues.length ? Math.max(...cpsValues) : 0,
                    textMatched,
                    captionAnalysis,
                    settings
                };

                this.qualityData.set(fileName, summary);
            },


            // Maps a word index from the whole-transcript comparison (validateTextMatch)
            // back to the caption that contains it, using the same "split each
            // caption's text on whitespace" tokenization validateTextMatch uses to
            // build its reconstructed word list, so the positions line up.
            findCaptionIndexForWordPosition(captions, wordIndex) {
                if (wordIndex === null || wordIndex === undefined || wordIndex < 0) {
                    return null;
                }
                let count = 0;
                for (const caption of captions) {
                    const wordsInCaption = caption.text.split(/\s+/).filter(Boolean).length;
                    if (wordIndex < count + wordsInCaption) {
                        return caption.index;
                    }
                    count += wordsInCaption;
                }
                return null;
            },


            validateTextMatch(captions, originalTranscript) {
                const reconstructed = captions.map(c => c.text).join(' ').replace(/\s+/g, ' ').trim();
                const original = originalTranscript.replace(/\s+/g, ' ').trim();

                const charDiff = Math.abs(reconstructed.length - original.length);
                const originalWords = original.split(/\s+/).filter(Boolean);
                const reconstructedWords = reconstructed.split(/\s+/).filter(Boolean);
                const wordDiff = Math.abs(originalWords.length - reconstructedWords.length);

                // Find the first word where the two versions diverge, so the report
                // can point at a concrete location instead of just a count.
                const normalize = w => w.toLowerCase().replace(/[^\w']/g, '');
                let firstMismatchIndex = -1;
                const maxCompare = Math.min(originalWords.length, reconstructedWords.length);
                for (let i = 0; i < maxCompare; i++) {
                    if (normalize(originalWords[i]) !== normalize(reconstructedWords[i])) {
                        firstMismatchIndex = i;
                        break;
                    }
                }

                let mismatchContext = null;
                if (firstMismatchIndex >= 0) {
                    const start = Math.max(0, firstMismatchIndex - 3);
                    mismatchContext = {
                        wordIndex: firstMismatchIndex,
                        original: originalWords.slice(start, firstMismatchIndex + 4).join(' '),
                        reconstructed: reconstructedWords.slice(start, firstMismatchIndex + 4).join(' ')
                    };
                }

                return {
                    isGoodMatch: charDiff <= 5 && wordDiff <= 1,
                    charDiff: charDiff,
                    wordDiff: wordDiff,
                    originalLength: original.length,
                    reconstructedLength: reconstructed.length,
                    originalWordCount: originalWords.length,
                    reconstructedWordCount: reconstructedWords.length,
                    mismatchContext
                };
            }
};
