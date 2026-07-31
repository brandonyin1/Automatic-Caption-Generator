export const segmentationMethods = {

            async generateProfessionalCaptions(whisperResult, fileName) {
                const settings = this.getCaptionSettings();
                try {
                    const fullTranscript = whisperResult.text;
                    const words = whisperResult.words || [];

                    if (!fullTranscript || !fullTranscript.trim()) {
                        throw new Error('No transcript received from Whisper');
                    }

                    if (words.length === 0) {
                        this.logMessage(`No word-level timing available, using segment fallback`, 'warning');
                        return this.buildCaptionsFromSegmentsFallback(whisperResult.segments, settings);
                    }

                    // Whisper/ElevenLabs' per-word timestamps are typically bare (no
                    // trailing punctuation), even though the polished full transcript
                    // has it. Both segmentation paths below build caption text
                    // directly from words and rely on punctuation to detect sentence/
                    // clause boundaries, so without this, punctuation silently
                    // vanishes from every caption. See attachPunctuationToWords().
                    const punctuatedWords = this.attachPunctuationToWords(words, fullTranscript);

                    // Phase 2/3: Rule-based segmentation builds captions directly
                    // from word timestamps (sentence/pause/duration-aware, instant,
                    // free, exact timing - no fuzzy matching needed). AI segmentation
                    // asks GPT to do the first-pass grouping instead (can read as
                    // more contextually natural), then still runs each resulting
                    // segment through the same word-level rules as a mechanical
                    // safety net before matching timing to it.
                    let captions;
                    if (settings.segmentationMethod === 'rule-based') {
                        captions = this.buildRuleBasedCaptions(punctuatedWords, settings);
                    } else {
                        this.logMessage(`🤖 Phase 2: AI caption segmentation (${settings.segmentationMethod})...`, 'plain');
                        const captionSegments = await this.getGPTCaptionSegments(fullTranscript, settings);
                        captions = this.buildCaptionsWithTiming(captionSegments, punctuatedWords, fullTranscript, fileName, settings);
                    }

                    return captions;

                } catch (error) {
                    this.logMessage(`Caption generation failed: ${error.message}`, 'error');
                    console.error('Error in professional caption generation:', error);

                    // Fallback to segment-based captions
                    this.logMessage(`Using fallback segment-based captions`, 'warning');
                    return this.buildCaptionsFromSegmentsFallback(whisperResult.segments, settings);
                }
            },


            // Primary caption segmenter - deterministic, not advisory. Packs whole
            // sentences together up to targetLen for compactness, but a single
            // sentence longer than targetLen still stands alone as its own
            // caption rather than being force-split, as long as it's under
            // hardMax (packPiecesGreedily never splits a single input piece, only
            // decides whether to combine additional ones - see below). Only a
            // sentence that exceeds hardMax on its own gets broken down further,
            // at commas/semicolons/colons first, then plain word boundaries as a
            // last resort. hardMax is never violated by anything this produces.
            splitTextByPunctuation(text, targetLen, hardMax) {
                const trimmed = (text || '').trim();
                if (!trimmed) {
                    return [];
                }
                if (trimmed.length <= targetLen) {
                    return [trimmed];
                }

                const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [trimmed];
                const packed = this.packPiecesGreedily(sentences, targetLen);

                return packed.flatMap(piece =>
                    piece.length <= hardMax ? [piece] : this.splitAtClauseBoundary(piece, targetLen, hardMax)
                );
            },


            splitAtClauseBoundary(text, targetLen, hardMax) {
                const clauses = text.match(/[^,;:]+[,;:]+(?:\s+|$)|[^,;:]+$/g) || [text];
                const packed = this.packPiecesGreedily(clauses, targetLen);

                return packed.flatMap(piece =>
                    piece.length <= hardMax ? [piece] : this.splitAtWordBoundary(piece, targetLen)
                );
            },


            splitAtWordBoundary(text, targetLen) {
                return this.packPiecesGreedily(text.trim().split(/\s+/), targetLen, ' ');
            },


            // Greedily concatenates pieces (sentences, clauses, or words) up to
            // maxLen per group, starting a new group only once adding the next
            // piece would exceed it. Keeps naturally-short pieces combined instead
            // of always splitting at the finest possible boundary.
            packPiecesGreedily(pieces, maxLen, joiner = '') {
                const packed = [];
                let current = '';

                for (const piece of pieces) {
                    const candidate = current ? current + joiner + piece : piece;
                    if (candidate.trim().length > maxLen && current) {
                        packed.push(current.trim());
                        current = piece;
                    } else {
                        current = candidate;
                    }
                }
                if (current.trim()) {
                    packed.push(current.trim());
                }

                return packed;
            },


            // AI-assisted segmentation (opt-in alternative to the rule-based
            // splitter above). Asks a GPT model to do the same job, which can
            // read as more contextually natural but is advisory - the model
            // isn't guaranteed to follow the break-priority rules, so any
            // failure or non-compliant response for a given chunk falls back to
            // the deterministic splitter for just that chunk rather than the
            // whole file.
            async getGPTCaptionSegments(fullTranscript, settings) {
                // Chunk the transcript so each GPT request stays well within its
                // output token budget - a single call over a long transcript can
                // get cut off mid-JSON (finish_reason: "length"), which would
                // otherwise degrade the whole file to fallback splitting.
                const chunks = this.chunkTranscriptForGPT(fullTranscript);
                const allSegments = [];

                for (let i = 0; i < chunks.length; i++) {
                    if (chunks.length > 1) {
                        this.logMessage(`🤖 Segmenting section ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`, 'plain');
                    }
                    const segments = await this.getGPTCaptionSegmentsForChunk(chunks[i], settings);
                    allSegments.push(...segments);
                }

                return allSegments;
            },


            // Splits a transcript into sentence-aligned chunks small enough that a
            // single GPT response can never be truncated, regardless of how long
            // the source video is.
            chunkTranscriptForGPT(fullTranscript, maxChunkChars = 1500) {
                const sentences = fullTranscript.split(/([.!?]+\s*)/).filter(s => s.length > 0);
                const rawChunks = [];
                let currentChunk = '';

                for (const part of sentences) {
                    if (currentChunk.length + part.length > maxChunkChars && currentChunk.trim()) {
                        rawChunks.push(currentChunk.trim());
                        currentChunk = part;
                    } else {
                        currentChunk += part;
                    }
                }
                if (currentChunk.trim()) {
                    rawChunks.push(currentChunk.trim());
                }

                // Guard against a run-on "sentence" with no punctuation still exceeding the limit
                const chunks = [];
                for (const chunk of rawChunks) {
                    if (chunk.length <= maxChunkChars * 1.5) {
                        chunks.push(chunk);
                        continue;
                    }
                    const words = chunk.split(/\s+/);
                    let wordChunk = '';
                    for (const word of words) {
                        if (wordChunk.length + word.length + 1 > maxChunkChars && wordChunk) {
                            chunks.push(wordChunk.trim());
                            wordChunk = word;
                        } else {
                            wordChunk += (wordChunk ? ' ' : '') + word;
                        }
                    }
                    if (wordChunk.trim()) {
                        chunks.push(wordChunk.trim());
                    }
                }

                return chunks.length > 0 ? chunks : [fullTranscript];
            },


            // Fills in {{maxChars}}, {{targetLow}}, {{targetHigh}}, {{preferredLow}},
            // {{preferredHigh}}, and {{transcript}} in the (possibly user-edited)
            // prompt template. Throws if {{transcript}} is missing so a broken
            // custom prompt fails loudly (caught by the caller's per-chunk
            // fallback) instead of silently asking GPT to segment nothing.
            buildAIPrompt(template, transcriptChunk, settings) {
                if (!template.includes('{{transcript}}')) {
                    throw new Error('Custom prompt is missing the {{transcript}} placeholder');
                }

                const maxChars = settings.maxChars;
                const targetLow = Math.max(5, Math.round(settings.targetChars - 5));
                const targetHigh = Math.min(maxChars - 5, Math.round(settings.targetChars + 5));
                const preferredLow = Math.max(5, Math.round(settings.targetChars - 15));
                const preferredHigh = Math.min(maxChars, Math.round(settings.targetChars + 15));

                const substitutions = {
                    '{{maxChars}}': maxChars,
                    '{{targetLow}}': targetLow,
                    '{{targetHigh}}': targetHigh,
                    '{{preferredLow}}': preferredLow,
                    '{{preferredHigh}}': preferredHigh,
                    '{{transcript}}': transcriptChunk
                };

                let prompt = template;
                for (const [token, value] of Object.entries(substitutions)) {
                    prompt = prompt.split(token).join(value);
                }
                return prompt;
            },


            async getGPTCaptionSegmentsForChunk(transcriptChunk, settings) {
                const apiKey = document.getElementById('apiKey').value.trim();

                try {
                    const prompt = this.buildAIPrompt(settings.customPrompt, transcriptChunk, settings);

                    const response = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: settings.segmentationMethod,
                            messages: [{
                                role: 'user',
                                content: prompt
                            }],
                            temperature: 0.05,
                            max_tokens: 2000
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`GPT API error: ${response.status}`);
                    }

                    const result = await response.json();
                    const choice = result.choices[0];

                    // If GPT ran out of tokens mid-response, the JSON is guaranteed
                    // to be incomplete - don't even try to parse it.
                    if (choice.finish_reason === 'length') {
                        throw new Error('GPT response was truncated (finish_reason: length)');
                    }

                    const content = choice.message.content.trim();

                    // Parse the JSON array from GPT response
                    let captionSegments;
                    try {
                        captionSegments = JSON.parse(content);
                    } catch (parseError) {
                        // If GPT response isn't pure JSON, try to extract array
                        const arrayMatch = content.match(/\[[\s\S]*\]/);
                        if (arrayMatch) {
                            captionSegments = JSON.parse(arrayMatch[0]);
                        } else {
                            throw new Error('Could not parse GPT caption segments');
                        }
                    }

                    if (!Array.isArray(captionSegments)) {
                        throw new Error('GPT response was not a JSON array');
                    }

                    return captionSegments;

                } catch (error) {
                    console.error('GPT caption segmentation failed for a chunk:', error);
                    this.logMessage(`GPT segmentation failed for a section (${error.message}) - using rule-based splitting for that section only`, 'warning');
                    // Fallback to the deterministic splitter, scoped to just this chunk
                    return this.splitTextByPunctuation(transcriptChunk, settings.targetChars, settings.maxChars);
                }
            },


            // Builds captions from GPT's text segments by walking the transcript-
            // aligned token list (alignTranscriptToWords) in lockstep with the
            // segments themselves, rather than free-searching the words array fresh
            // for each segment. Since captionSegments are (by construction and the
            // prompt's own instructions) just the full transcript chopped into
            // pieces, in order, each segment's tokens should occupy the next slice
            // of that same alignment - so the token cursor always advances by that
            // segment's own token count, never by a guess derived from a failed
            // search. This matters: a single word that doesn't line up (a
            // mishearing, a number written differently, GPT lightly paraphrasing,
            // or - the specific bug this replaced - a hyphenated compound word
            // tokenized inconsistently between two different normalizers) now only
            // costs confidence on that one slice. It can't derail every caption
            // after it the way the old forward-only "give up and jump a guessed
            // distance" search could - which is exactly what was happening: one
            // failed match on a hyphenated term partway through a file left every
            // later caption searching from the wrong position, so it silently fell
            // back to approximate placement all the way to the end.
            buildCaptionsWithTiming(captionSegments, words, fullTranscript, fileName, settings) {
                if (!captionSegments || !Array.isArray(captionSegments)) {
                    throw new Error(`Invalid captionSegments: ${typeof captionSegments}`);
                }

                if (!words || !Array.isArray(words) || words.length === 0) {
                    throw new Error(`Invalid words array: ${typeof words}, length: ${words?.length}`);
                }

                const alignedTokens = this.alignTranscriptToWords(fullTranscript, words);
                const captions = [];
                let tokenCursor = 0;
                let lastKnownWordIndex = -1;

                for (let i = 0; i < captionSegments.length; i++) {
                    const segmentText = captionSegments[i]?.trim();

                    if (!segmentText) {
                        continue;
                    }

                    const segmentTokens = segmentText.match(/[\wʼ'-]+[.,!?;:]*/g) || [];
                    if (segmentTokens.length === 0) {
                        continue;
                    }

                    const sliceStart = tokenCursor;
                    const sliceEnd = Math.min(sliceStart + segmentTokens.length, alignedTokens.length);
                    const slice = alignedTokens.slice(sliceStart, sliceEnd);
                    tokenCursor = sliceEnd;

                    const timedInSlice = slice.filter(t => t.wordIndex !== null);

                    let startWordIndex, endWordIndex, matchConfidence, approximated;

                    if (timedInSlice.length > 0) {
                        startWordIndex = timedInSlice[0].wordIndex;
                        endWordIndex = timedInSlice[timedInSlice.length - 1].wordIndex;
                        // What fraction of this segment's tokens actually matched a
                        // word (1.0 = every token lined up). Below 1.0 means some
                        // tokens in the slice didn't confidently match anything -
                        // worth a human glance.
                        matchConfidence = timedInSlice.length / slice.length;
                        approximated = false;
                        lastKnownWordIndex = endWordIndex;
                    } else {
                        // Not one token in this slice matched a word. Previously
                        // this text was just dropped - silently missing from the
                        // output with no trace. Instead, fall back to an
                        // approximate position right after the last word we did
                        // manage to place (not a guess compounded from earlier
                        // failures), so the text still makes it into the captions -
                        // flagged (via caption.approximated) for the user to verify
                        // against the audio rather than vanishing unnoticed.
                        const fallbackRange = this.buildApproximateWordRange(segmentTokens.length, words, lastKnownWordIndex + 1);

                        if (!fallbackRange) {
                            this.logMessage(`⚠️ Dropped caption text - no timing data available near this point: "${this.truncateForLog(segmentText)}"`, 'warning');
                            continue;
                        }

                        this.logMessage(`⚠️ Caption text could not be matched to the audio - using approximate timing: "${this.truncateForLog(segmentText)}"`, 'warning');
                        startWordIndex = fallbackRange.startIdx;
                        endWordIndex = fallbackRange.endIdx;
                        matchConfidence = undefined;
                        approximated = true;
                        lastKnownWordIndex = endWordIndex;
                    }

                    // Mechanical safety net: this segment's grouping came from GPT
                    // (or was approximated), but still run its resolved word range
                    // through the same sentence/pause/duration rules rule-based
                    // segmentation uses, same as everywhere else. Usually a no-op -
                    // GPT is asked to respect these limits already - and only kicks
                    // in when a segment runs past maxDuration or spans a long pause,
                    // in which case it comes back as more than one caption.
                    const subPieces = this.splitWordsIntoCaptions(words, startWordIndex, endWordIndex, settings);
                    const piecesToUse = subPieces.length > 1 ? subPieces : [{
                        start: words[startWordIndex].start,
                        end: words[endWordIndex].end,
                        text: segmentText
                    }];

                    for (const piece of piecesToUse) {
                        const caption = {
                            index: captions.length + 1,
                            start: piece.start,
                            end: piece.end,
                            text: piece.text
                        };
                        if (approximated) {
                            caption.approximated = true;
                        } else if (typeof matchConfidence === 'number') {
                            caption.matchConfidence = matchConfidence;
                        }
                        captions.push(caption);
                    }
                }

                this.finalizeCaptionTiming(captions, settings);

                return captions;
            },


            // Whisper/ElevenLabs' per-word `.word` field is typically bare text
            // with no trailing punctuation, even though the polished full
            // transcript (fullTranscript) has it. Runs once per file: walks the
            // transcript's punctuated tokens and the (unpunctuated) words array in
            // parallel, borrowing each token's real spelling + trailing
            // punctuation onto the matching word. Uses a small forward lookahead
            // (like alignTranscriptToWords below) to tolerate occasional non-1:1
            // mismatches rather than requiring an exact lockstep alignment. Falls
            // back to a word's original text untouched wherever no confident match
            // is found nearby, rather than corrupting it or losing alignment
            // entirely.
            attachPunctuationToWords(words, fullTranscript) {
                const tokens = (fullTranscript || '').match(/[\wʼ'-]+[.,!?;:]*/g) || [];
                const normalize = (s) => (s || '').toLowerCase().replace(/[^\w']/g, '');

                // A token like "non-TwinSAFE" or "I-O." can correspond to
                // MULTIPLE raw words if Whisper itself split the hyphenated
                // compound into separate ones (observed for real: "non-TwinSAFE"
                // -> "non"+"TwinSAFE", "I-O" -> "I"+"O") - matching it whole would
                // let the first raw word's fuzzy/substring match consume the
                // ENTIRE token, stranding the next raw word with no match at all
                // (a duplicated or orphaned single-word caption in the final
                // text). Only reached as a fallback when a token doesn't match a
                // word exactly - a raw word that already has the hyphen intact
                // (Whisper doesn't always split them) matches on the fast path
                // below and never needs this.
                const explodeHyphenatedToken = (token) => {
                    const trailingPunctMatch = token.match(/[.,!?;:]+$/);
                    const trailingPunct = trailingPunctMatch ? trailingPunctMatch[0] : '';
                    const core = trailingPunct ? token.slice(0, -trailingPunct.length) : token;
                    const parts = core.split('-');
                    if (parts.length < 2 || parts.some(p => !p)) {
                        return null;
                    }
                    return parts.map((part, i) => part + (i === parts.length - 1 ? trailingPunct : '-'));
                };

                const tokenQueue = tokens.slice();
                let tokenCursor = 0;

                return words.map(w => {
                    const target = normalize(w.word);
                    if (!target) {
                        return w;
                    }

                    let pos = tokenCursor;
                    while (pos < Math.min(tokenCursor + 6, tokenQueue.length)) {
                        const tokenNormalized = normalize(tokenQueue[pos]);
                        if (!tokenNormalized) {
                            pos++;
                            continue;
                        }

                        if (tokenNormalized === target) {
                            tokenCursor = pos + 1;
                            return { ...w, word: tokenQueue[pos] };
                        }

                        if (tokenNormalized.includes(target) || target.includes(tokenNormalized)) {
                            const exploded = explodeHyphenatedToken(tokenQueue[pos]);
                            if (exploded) {
                                tokenQueue.splice(pos, 1, ...exploded);
                                continue; // re-examine the same position - now the first exploded part
                            }
                            tokenCursor = pos + 1;
                            return { ...w, word: tokenQueue[pos] };
                        }

                        pos++;
                    }

                    // No confident match nearby - leave this word as-is and don't
                    // advance the cursor, so the next word still gets a fair chance
                    // to resync against the transcript.
                    return w;
                });
            },


            // The mirror image of attachPunctuationToWords: aligns each token of
            // the full transcript (in transcript order) to a word timestamp,
            // tolerating minor local mismatches (a word ElevenLabs/Whisper
            // transcribed slightly differently than the polished transcript text,
            // e.g. "500" vs "five hundred", or a hyphenated compound tokenized
            // inconsistently elsewhere) without losing sync - this walks the
            // transcript and the words array together exactly once, in order, so a
            // single mismatch only costs that one token instead of derailing
            // everything after it. Used by buildCaptionsWithTiming to find timing
            // for GPT's text segments by their position in the transcript, rather
            // than by re-searching the words array fresh for each one. Returns one
            // entry per transcript token: { text, start, end, wordIndex } - start/
            // end/wordIndex are null wherever no confident nearby match was found.
            alignTranscriptToWords(fullTranscript, words) {
                const tokens = (fullTranscript || '').match(/[\wʼ'-]+[.,!?;:]*/g) || [];
                const normalize = (s) => (s || '').toLowerCase().replace(/[^\w']/g, '');

                let wordCursor = 0;
                return tokens.map(token => {
                    const target = normalize(token);
                    if (!target) {
                        return { text: token, start: null, end: null, wordIndex: null };
                    }

                    const searchLimit = Math.min(wordCursor + 6, words.length);
                    for (let pos = wordCursor; pos < searchLimit; pos++) {
                        const wordNormalized = normalize(words[pos].word);
                        if (wordNormalized && this.wordsMatch(target, wordNormalized)) {
                            wordCursor = pos + 1;
                            return { text: token, start: words[pos].start, end: words[pos].end, wordIndex: pos };
                        }
                    }

                    return { text: token, start: null, end: null, wordIndex: null };
                });
            },


            // Builds captions directly from word timestamps, with no fuzzy text
            // matching involved at all - this is rule-based segmentation in full:
            // one call to splitWordsIntoCaptions across the entire transcript.
            // A trailing period doesn't always end a sentence: a spelled-out
            // abbreviation read aloud (I/O as "I dot O dot") or a URL Whisper's
            // own transcript renders with literal periods (www.example.com) look
            // identical to a real sentence end by punctuation alone, and word-
            // level timestamps don't carry an "is this abbreviated" flag to check
            // instead. Suppresses the false break in either of two shapes that
            // cover both cases without needing real NLP:
            //  - the word just completed is a bare 1-2 letter token (the shape
            //    of a spelled-out abbreviation like "I." or "O.", as opposed to a
            //    real word/acronym like "PLC." which ends a genuine sentence);
            //  - the next word starts with a lowercase letter - a real new
            //    sentence is virtually always capitalized, so a lowercase
            //    continuation ("com" right after "www.") means this period was
            //    structural, not sentence-final.
            looksLikeAbbreviation(currentWord, nextWord) {
                const bareWord = (currentWord.word || '').replace(/[.,!?;:]+$/, '');
                if (/^[A-Za-z]{1,2}$/.test(bareWord)) {
                    return true;
                }
                if (nextWord && nextWord.word) {
                    const firstChar = nextWord.word.trim().charAt(0);
                    if (/[a-z]/.test(firstChar)) {
                        return true;
                    }
                }
                return false;
            },


            buildRuleBasedCaptions(words, settings) {
                const pieces = this.splitWordsIntoCaptions(words, 0, words.length - 1, settings);
                const captions = pieces.map((piece, i) => ({
                    index: i + 1,
                    start: piece.start,
                    end: piece.end,
                    text: piece.text
                }));
                this.finalizeCaptionTiming(captions, settings);
                return captions;
            },


            // Walks words[startIdx..endIdx] (inclusive) and breaks them into
            // caption-sized pieces in two phases. First, group words into natural
            // units split only at hard boundaries: a long pause (once there's
            // already a reasonable amount of accumulated text, so a brief
            // hesitation doesn't produce a throwaway fragment) or a sentence
            // ending - both always apply regardless of resulting size, since a
            // real pause or a complete sentence is always a legitimate place to
            // cut ("breaks during narration should still cut like normal").
            // Second, for each unit: if it already fits within maxChars/
            // maxDuration, it becomes one caption as-is - it's fine for this to
            // land noticeably above or below targetChars, since the point is not
            // to fragment a sentence that doesn't need it. If a unit is too long
            // to fit in one caption, splitOversizedUnit divides it into pieces
            // close to targetChars each, rather than greedily packing each piece
            // up to maxChars and leaving whatever's left as a short, awkward
            // final caption. Used both as the entirety of rule-based segmentation
            // (called across the full words array) and as a safety net applied to
            // each AI-matched segment's own word range, so pause/duration limits
            // and sentence-aware chunking apply the same way regardless of which
            // method chose the words.
            splitWordsIntoCaptions(words, startIdx, endIdx, settings) {
                const pauseMinChars = Math.max(10, Math.round(settings.targetChars * 0.4));
                const units = [];
                let current = [];
                let prevEnd = null;

                const flushUnit = () => {
                    if (current.length > 0) {
                        units.push(current);
                    }
                    current = [];
                };

                for (let i = startIdx; i <= endIdx; i++) {
                    const w = words[i];
                    if (!w || typeof w.start !== 'number' || typeof w.end !== 'number') {
                        continue;
                    }

                    if (prevEnd !== null && current.length > 0 && (w.start - prevEnd) > settings.pauseThreshold) {
                        if (this.joinWordsToText(current).length >= pauseMinChars) {
                            flushUnit();
                        }
                    }

                    current.push(w);
                    prevEnd = w.end;

                    if (/[.!?]$/.test(this.joinWordsToText(current)) && !this.looksLikeAbbreviation(w, words[i + 1])) {
                        flushUnit();
                    }
                }
                flushUnit();

                const pieces = [];
                for (const unit of units) {
                    const unitText = this.joinWordsToText(unit);
                    if (!unitText) {
                        continue;
                    }
                    const unitDuration = unit[unit.length - 1].end - unit[0].start;
                    if (unitText.length <= settings.maxChars && unitDuration <= settings.maxDuration) {
                        pieces.push({ start: unit[0].start, end: unit[unit.length - 1].end, text: unitText });
                    } else {
                        pieces.push(...this.splitOversizedUnit(unit, settings));
                    }
                }

                return pieces;
            },


            // Splits one over-long unit (a sentence, or a pause-bounded fragment,
            // that doesn't fit within maxChars/maxDuration on its own) into pieces
            // balanced by on-screen TIME rather than raw character count, instead
            // of greedily filling each piece up to maxChars and leaving a short,
            // awkward remainder dangling at the end. Piece count factors in
            // duration as well as length (a unit can be short in text but still
            // exceed maxDuration - e.g. a slow, deliberately-paced sentence with
            // longer pauses - and needs splitting even though targetChars/maxChars
            // alone would say it fits in one caption), then breaks near each
            // piece's ideal time-balanced boundary - preferring a nearby clause
            // boundary (comma/semicolon/colon) within a tolerance window, falling
            // back to the word boundary closest to the ideal point once the
            // overshoot grows too large. Balancing by time instead of characters
            // tracks almost identically to the old character-based approach for
            // normally-paced speech (the two are roughly proportional), while
            // actually fixing the slow-paced case instead of silently leaving it
            // as one long caption. maxChars/maxDuration are still checked before
            // every word is added, so they remain a true ceiling no matter how
            // the ideal boundaries land.
            splitOversizedUnit(unit, settings) {
                const unitStart = unit[0].start;
                const unitDuration = unit[unit.length - 1].end - unitStart;
                const fullText = this.joinWordsToText(unit);
                const numPieces = Math.max(
                    1,
                    Math.round(fullText.length / settings.targetChars),
                    Math.ceil(fullText.length / settings.maxChars),
                    Math.ceil(unitDuration / settings.maxDuration)
                );
                const idealChunkDuration = unitDuration / numPieces;
                const durationTolerance = idealChunkDuration * 0.4;

                const pieces = [];
                let current = [];
                let currentStart = null;
                let pieceIndex = 0;

                const flush = () => {
                    if (current.length === 0) return;
                    const text = this.joinWordsToText(current);
                    if (text) {
                        pieces.push({ start: currentStart, end: current[current.length - 1].end, text });
                    }
                    current = [];
                    currentStart = null;
                    pieceIndex++;
                };

                for (let i = 0; i < unit.length; i++) {
                    const w = unit[i];

                    if (current.length > 0) {
                        const prospectiveText = this.joinWordsToText([...current, w]);
                        const prospectiveDuration = w.end - currentStart;
                        if (prospectiveText.length > settings.maxChars || prospectiveDuration > settings.maxDuration) {
                            flush();
                        }
                    }

                    if (currentStart === null) currentStart = w.start;
                    current.push(w);

                    if (i === unit.length - 1) {
                        continue;
                    }

                    const elapsedSoFar = current[current.length - 1].end - unitStart;
                    const idealBoundary = (pieceIndex + 1) * idealChunkDuration;
                    if (elapsedSoFar >= idealBoundary) {
                        const textSoFar = this.joinWordsToText(current);
                        const endsClause = /[,;:]$/.test(textSoFar);
                        const overshoot = elapsedSoFar - idealBoundary;
                        if (endsClause || overshoot >= durationTolerance) {
                            flush();
                        }
                    }
                }
                flush();

                return pieces;
            },


            // Reconstructs readable text from a run of Whisper word objects.
            // Handles both plausible Whisper word-field conventions (a leading
            // space baked into each word, or none) by collapsing whitespace after
            // joining rather than assuming one or the other.
            joinWordsToText(wordsSlice) {
                return wordsSlice.map(w => w.word)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .replace(/-\s+/g, '-')
                    .replace(/\s+([.,!?;:])/g, '$1')
                    .trim();
            },


            // Resolves an approximate word index range for text the fuzzy matcher
            // couldn't confidently place, by consuming roughly wordCount words
            // starting at currentWordIndex regardless of whether they textually
            // match. This is a best-effort placement, not a verified one - callers
            // should mark the result for review. Returns null only when there's no
            // timing data left to anchor to at all (end of the transcript's word
            // list).
            buildApproximateWordRange(wordCount, words, currentWordIndex) {
                if (currentWordIndex >= words.length) {
                    return null;
                }

                const startIdx = currentWordIndex;
                const endIdx = Math.min(currentWordIndex + Math.max(wordCount, 1) - 1, words.length - 1);

                const startWord = words[startIdx];
                const endWord = words[endIdx];

                if (!startWord || !endWord || typeof startWord.start !== 'number' || typeof endWord.end !== 'number') {
                    return null;
                }

                return { startIdx, endIdx };
            },


            truncateForLog(text, maxLength = 60) {
                return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
            },


            // Shared finishing pass applied after captions are assembled,
            // regardless of which segmentation method built them: nudges timing
            // slightly earlier/later than the literal spoken words for readability,
            // closes small gaps between adjacent captions, stretches any that are
            // too brief, extends the very last caption by a second so it doesn't
            // disappear right as the audio ends, then renumbers.
            finalizeCaptionTiming(captions, settings) {
                // Runs first, against the real/unpadded gaps between captions -
                // gap-elimination below then only has to mop up whatever small gap
                // is left over (often zero) instead of closing the room padding
                // needs before it gets a chance to use it.
                this.applyCaptionPadding(captions, settings.leadIn, settings.hold, settings.maxDuration);

                // Capped at maxDuration - closing a gap is meant to avoid a
                // moment with no caption on screen, not to stretch a caption that
                // was already a safe length into one that overruns the limit.
                // Splitting decisions (splitOversizedUnit) already ran against
                // each caption's un-gap-closed span, so nothing downstream
                // re-checks this - without the cap, a caption that was correctly
                // left whole (its real speech comfortably under maxDuration) could
                // still end up flagged too-long purely from absorbing a trailing
                // gap here.
                for (let i = 1; i < captions.length; i++) {
                    const previous = captions[i - 1];
                    const current = captions[i];
                    const gap = current.start - previous.end;
                    if (gap > 0 && gap < settings.gapThreshold) {
                        const maxAllowedEnd = previous.start + settings.maxDuration;
                        previous.end = Math.min(current.start, maxAllowedEnd);
                    }
                }

                this.enforceMinimumDuration(captions, settings.minDuration);

                if (captions.length > 0) {
                    captions[captions.length - 1].end += 1.0;
                }

                captions.forEach((c, i) => { c.index = i + 1; });
            },


            // Nudges each caption's start earlier and end later than the literal
            // word timestamps, so captions feel like they're already on screen
            // when speech starts and don't vanish the instant it ends - standard
            // practice in caption style guides, since syncing exactly to speech
            // onset/offset reads as slightly late. Single left-to-right pass:
            // each caption's start is floored at the previous caption's (possibly
            // already-padded) end, and its end is capped at the next caption's
            // (not yet padded) start - both bounds always reference the neighbor's
            // live value, which keeps this provably overlap-safe in one pass with
            // no lookahead. When there isn't enough real gap for the full amount,
            // it silently applies less (down to zero) rather than ever
            // overlapping the neighboring caption.
            applyCaptionPadding(captions, leadInSeconds, holdSeconds, maxDuration) {
                if (!leadInSeconds && !holdSeconds) return;

                for (let i = 0; i < captions.length; i++) {
                    const caption = captions[i];

                    if (leadInSeconds > 0) {
                        const earliestAllowed = i > 0 ? captions[i - 1].end : 0;
                        caption.start = Math.max(earliestAllowed, caption.start - leadInSeconds);
                    }

                    if (holdSeconds > 0) {
                        const latestAllowed = i < captions.length - 1 ? captions[i + 1].start : Infinity;
                        caption.end = Math.min(latestAllowed, caption.end + holdSeconds);
                    }

                    // Neither adjustment above is meant to let a caption grow past
                    // maxDuration - both exist purely to feel less abrupt at the
                    // edges, not to override the length limit that already shaped
                    // how many pieces this caption was split into.
                    if (maxDuration && (caption.end - caption.start) > maxDuration) {
                        caption.end = caption.start + maxDuration;
                    }
                }
            },


            // Stretches any caption shorter than minDuration, without pushing past
            // the next caption's start (so captions never overlap). When the next
            // caption starts too soon to fully satisfy minDuration, extends as far
            // as possible as a best effort rather than leaving it untouched.
            enforceMinimumDuration(captions, minDuration) {
                for (let i = 0; i < captions.length; i++) {
                    const desiredEnd = captions[i].start + minDuration;
                    if (desiredEnd > captions[i].end) {
                        const ceiling = i < captions.length - 1 ? captions[i + 1].start : desiredEnd;
                        captions[i].end = Math.min(desiredEnd, Math.max(ceiling, captions[i].end));
                    }
                }
            },


            wordsMatch(word1, word2) {
                if (word1 === word2) return true;
                if (word1.includes(word2) || word2.includes(word1)) return true;
                
                // Handle common contractions
                const contractions = {
                    'dont': "don't", 'cant': "can't", 'wont': "won't",
                    'youll': "you'll", 'ill': "i'll", 'well': "we'll"
                };
                
                if (contractions[word1] === word2 || contractions[word2] === word1) return true;
                
                return false;
            },


            buildCaptionsFromSegmentsFallback(segments, settings) {
                const captions = [];
                let captionIndex = 1;

                for (const segment of segments) {
                    const text = segment.text?.trim();
                    if (!text) continue;

                    if (text.length <= settings.maxChars) {
                        captions.push({
                            index: captionIndex++,
                            start: segment.start,
                            end: segment.end,
                            text: text
                        });
                    } else {
                        const splitCaptions = this.splitLongSegment(segment, captionIndex, settings);
                        captions.push(...splitCaptions);
                        captionIndex += splitCaptions.length;
                    }
                }

                this.enforceMinimumDuration(captions, settings.minDuration);

                // Extend the last caption by 1 second
                if (captions.length > 0) {
                    const lastCaption = captions[captions.length - 1];
                    lastCaption.end += 1.0;
                }

                return captions;
            },


            splitLongSegment(segment, startIndex, settings) {
                const text = segment.text.trim();
                const duration = segment.end - segment.start;
                const pieces = this.splitTextByPunctuation(text, settings.targetChars, settings.maxChars);

                const captions = [];
                let currentStart = segment.start;
                let charsConsumed = 0;
                let captionIndex = startIndex;

                pieces.forEach((piece, i) => {
                    charsConsumed += piece.length;
                    const isLast = i === pieces.length - 1;
                    const pieceEnd = isLast ? segment.end : segment.start + duration * (charsConsumed / text.length);

                    captions.push({
                        index: captionIndex++,
                        start: currentStart,
                        end: pieceEnd,
                        text: piece
                    });

                    currentStart = pieceEnd;
                });

                return captions;
            }
};
