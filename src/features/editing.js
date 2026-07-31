export const editingMethods = {

            // Merges a caption's text and timing into the next caption, removing
            // this one. The merged caption spans from this caption's start to the
            // next caption's end; stale match-confidence info from either half is
            // cleared since it no longer describes a single matched segment.
            mergeCaptionWithNext(fileName, index) {
                const captions = this.transcripts.get(fileName);
                if (!captions || index >= captions.length - 1) {
                    return;
                }

                this.pushUndoSnapshot(fileName, captions);

                const current = captions[index];
                const next = captions[index + 1];

                next.text = `${current.text} ${next.text}`.trim();
                next.start = current.start;
                delete next.matchConfidence;
                delete next.approximated;

                captions.splice(index, 1);
                this.renumberCaptions(captions);
                this.refreshFileState(fileName, captions);
                this.showMessage('Captions merged.', 'success');
            },


            // Splits a caption's text at the current cursor position in its editable
            // field. There's no word-level timing to split on after the fact, so the
            // on-screen duration is divided proportionally by character count and
            // both halves are flagged as approximated so they surface for review.
            splitCaptionAtCursor(fileName, index, textEl) {
                const captions = this.transcripts.get(fileName);
                if (!captions || !captions[index]) {
                    return;
                }

                const splitIndex = this.getCaretTextOffset(textEl);
                const fullText = textEl.innerText.trim();

                if (splitIndex === null || splitIndex <= 0 || splitIndex >= fullText.length) {
                    this.showMessage('Click inside the caption text to place your cursor, then try Split again.', 'warning');
                    return;
                }

                const beforeText = fullText.slice(0, splitIndex).trim();
                const afterText = fullText.slice(splitIndex).trim();

                if (!beforeText || !afterText) {
                    this.showMessage('Cannot split at the very start or end of the text.', 'warning');
                    return;
                }

                this.pushUndoSnapshot(fileName, captions);

                const caption = captions[index];
                const duration = caption.end - caption.start;
                const ratio = beforeText.length / fullText.length;
                const splitTime = caption.start + duration * ratio;

                const newCaption = {
                    index: 0, // reassigned by renumberCaptions below
                    start: splitTime,
                    end: caption.end,
                    text: afterText,
                    approximated: true
                };

                caption.text = beforeText;
                caption.end = splitTime;
                caption.approximated = true;

                captions.splice(index + 1, 0, newCaption);
                this.renumberCaptions(captions);
                this.refreshFileState(fileName, captions);
                this.showMessage('Caption split - please verify the timing on both halves.', 'success');
            },


            // Inserts a new blank caption immediately after index, for filling a
            // gap (e.g. text that got dropped during matching) rather than only
            // being able to merge/split/delete what generation already produced.
            // Starts right at the current caption's end; duration defaults to
            // minDuration (or 1s, whichever is larger), capped at the next
            // caption's start using the same best-effort MIN_SLIVER pattern
            // commitCaptionTimeEdit uses - degrades to a tiny sliver rather than
            // blocking the insert when there's no real room, same as manual time
            // edits already do. No matchConfidence/approximated flags, since
            // nothing was auto-matched; the empty text trips the existing
            // SHORT_TEXT issue flag on its own, which doubles as a "still needs
            // text" reminder.
            insertCaptionAfter(fileName, index) {
                const captions = this.transcripts.get(fileName);
                const current = captions && captions[index];
                if (!current) {
                    return;
                }

                const MIN_SLIVER = 0.05;
                const settings = this.getCaptionSettings();
                const next = index < captions.length - 1 ? captions[index + 1] : null;

                const newStart = current.end;
                const desiredEnd = newStart + Math.max(settings.minDuration, 1.0);
                const ceiling = next ? Math.max(newStart + MIN_SLIVER, next.start) : desiredEnd;
                const newEnd = Math.min(desiredEnd, ceiling);

                this.pushUndoSnapshot(fileName, captions);

                captions.splice(index + 1, 0, { index: 0, start: newStart, end: newEnd, text: '' });
                this.renumberCaptions(captions);
                this.refreshFileState(fileName, captions);
                this.showMessage('Inserted a blank caption - click it and type the text.', 'success');
            },


            deleteCaption(fileName, index) {
                const captions = this.transcripts.get(fileName);
                if (!captions || !captions[index]) {
                    return;
                }

                this.pushUndoSnapshot(fileName, captions);

                captions.splice(index, 1);
                this.renumberCaptions(captions);
                this.refreshFileState(fileName, captions);
                this.showMessage('Caption deleted. Ctrl+Z to undo.', 'success');
            },


            renumberCaptions(captions) {
                captions.forEach((caption, i) => {
                    caption.index = i + 1;
                });
            },


            // Returns the plain-text character offset of the caret within el, or
            // null if the current selection isn't inside el at all (e.g. the user
            // clicked Split without having clicked into the text first).
            getCaretTextOffset(el) {
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0) {
                    return null;
                }

                const range = selection.getRangeAt(0);
                if (!el.contains(range.startContainer)) {
                    return null;
                }

                const preRange = document.createRange();
                preRange.selectNodeContents(el);
                preRange.setEnd(range.startContainer, range.startOffset);
                return preRange.toString().length;
            },


            // Re-derives the quality summary (using the cached Whisper transcript,
            // if available) and rebuilds the caption card view after any edit that
            // changes the shape of the captions array - merge, split, delete, or
            // a full regenerate.
            refreshFileState(fileName, captions) {
                const whisperResult = this.whisperResults.get(fileName);
                if (whisperResult) {
                    this.generateQualitySummary(fileName, captions, whisperResult.text);
                }
                // loadCurrentFile() rebuilds every caption card from scratch, which
                // resets scroll to the top by default - fine for switching files or
                // the initial results view, but jarring here since this runs after
                // every merge/split/insert/delete/undo/regenerate on the file
                // you're already looking at. Restore where you were instead.
                const transcriptEditor = document.getElementById('transcriptEditor');
                const scrollTop = transcriptEditor ? transcriptEditor.scrollTop : 0;
                this.loadCurrentFile();
                if (transcriptEditor) {
                    transcriptEditor.scrollTop = scrollTop;
                }
                this.updateQualitySummaryForCurrentFile();
                this.saveSessionSnapshot();
            },


            // Snapshots a caption array before a destructive edit (merge/split/
            // delete/regenerate) so it can be restored later. Deep-clones the
            // caption objects themselves so later in-place mutations (e.g. the
            // same array reference being spliced again) can't retroactively alter
            // an already-saved snapshot.
            pushUndoSnapshot(fileName, captions) {
                if (!this.undoStacks.has(fileName)) {
                    this.undoStacks.set(fileName, []);
                }
                const stack = this.undoStacks.get(fileName);
                stack.push(captions.map(caption => ({ ...caption })));
                if (stack.length > this.MAX_UNDO_STEPS) {
                    stack.shift();
                }
                this.updateUndoButtonState();
            },


            undoLastEdit(fileName) {
                const stack = this.undoStacks.get(fileName);
                if (!stack || stack.length === 0) {
                    this.showMessage('Nothing to undo for this file.', 'warning');
                    return;
                }

                const previous = stack.pop();
                const captions = this.transcripts.get(fileName);
                if (!captions) {
                    return;
                }

                // Mutate the existing array in place rather than replacing it in the
                // map, so this.currentCaptions (the same reference, set by
                // loadCurrentFile) stays valid without needing to be re-fetched.
                captions.length = 0;
                captions.push(...previous);

                this.refreshFileState(fileName, captions);
                this.updateUndoButtonState();
                this.showMessage('Undid last change.', 'success');
            },


            updateUndoButtonState() {
                const undoBtn = document.getElementById('undoBtn');
                if (!undoBtn) {
                    return;
                }
                const currentFile = this.files[this.currentFileIndex];
                const stack = currentFile ? this.undoStacks.get(currentFile.name) : null;
                undoBtn.disabled = !stack || stack.length === 0;
            },


            escapeRegExp(text) {
                return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            },


            // Splits text as close to the midpoint as possible - a sentence end
            // near the middle first, then a clause boundary, then just the
            // nearest word boundary to the middle - always producing exactly 2
            // pieces (or 1, if the text is a single word that can't usefully
            // split further). Used by autoFixCaptionIssues for a caption that's
            // too long in on-screen TIME despite short text with no natural
            // targetChars-sized break for splitTextByPunctuation to land on;
            // unlike that function (which aims for an approximate per-piece
            // SIZE), this always aims for a roughly even split regardless of size,
            // matching "just cut this long fragment in half."
            splitTextNearMiddle(text) {
                const trimmed = text.trim();
                const mid = trimmed.length / 2;
                const tolerance = trimmed.length * 0.25;

                const nearestBoundary = (regex) => {
                    let best = null;
                    let bestDistance = Infinity;
                    for (const m of trimmed.matchAll(new RegExp(regex, 'g'))) {
                        const pos = m.index + m[0].length;
                        if (pos <= 0 || pos >= trimmed.length) continue;
                        const distance = Math.abs(pos - mid);
                        if (distance < bestDistance) {
                            bestDistance = distance;
                            best = pos;
                        }
                    }
                    return best !== null && bestDistance <= tolerance ? best : null;
                };

                let splitPos = nearestBoundary('[.!?]+\\s+');
                if (splitPos === null) {
                    splitPos = nearestBoundary('[,;:]\\s+');
                }
                if (splitPos === null) {
                    let best = null;
                    let bestDistance = Infinity;
                    for (let i = 0; i < trimmed.length; i++) {
                        if (trimmed[i] === ' ') {
                            const distance = Math.abs(i - mid);
                            if (distance < bestDistance) {
                                bestDistance = distance;
                                best = i + 1;
                            }
                        }
                    }
                    splitPos = best;
                }

                if (splitPos === null || splitPos <= 0 || splitPos >= trimmed.length) {
                    return [trimmed];
                }
                return [trimmed.slice(0, splitPos).trim(), trimmed.slice(splitPos).trim()];
            },


            // Mechanically fixes what can actually be fixed without human judgment:
            // captions that are too brief on screen or read too fast (extend the
            // end time, capped at the next caption's start - same overlap-safe
            // rule manual timestamp edits already follow) and captions that are
            // too long, whether in characters or in on-screen duration (auto-split
            // using the same sentence/clause/word-boundary priority the initial
            // rule-based segmentation uses). Deliberately does NOT touch
            // approximated timing, uncertain word-match confidence, text-
            // divergence, or "very short text" flags - there's no algorithmic fix
            // for "is this text actually correct," only a human listening to the
            // audio can resolve those, and guessing would risk quietly papering
            // over a real transcription error instead of surfacing it. One undo
            // snapshot for the whole pass, matching applyFindReplace's one-
            // snapshot-per-file convention, so Ctrl+Z reverts everything here as a
            // single step rather than one step per caption touched.
            autoFixCaptionIssues(fileName) {
                const captions = this.transcripts.get(fileName);
                if (!captions || captions.length === 0) {
                    return;
                }

                const settings = this.getCaptionSettings();
                const isFixableBySplit = (caption) => {
                    const duration = caption.end - caption.start;
                    return caption.text.length > settings.maxChars || duration > settings.maxDuration;
                };
                const isFixableTiming = (caption) => {
                    const duration = caption.end - caption.start;
                    const cps = duration > 0 ? caption.text.length / duration : Infinity;
                    return duration < settings.minDuration || (isFinite(cps) && cps > settings.maxReadingSpeed);
                };

                if (!captions.some(c => isFixableBySplit(c) || isFixableTiming(c))) {
                    this.showMessage('No auto-fixable timing/length issues found - anything still flagged needs a manual look.', 'info');
                    return;
                }

                this.pushUndoSnapshot(fileName, captions);

                // Pass 1: split too-long captions first (reverse order so splicing
                // in extra pieces doesn't shift the index of captions not yet
                // visited), in two stages. Stage 1 handles too much CHARACTER
                // length exactly like the initial generation's splitOversizedUnit
                // (sentence, then clause, then word-boundary priority). Stage 2
                // catches what stage 1 can't: a caption can be too long in
                // on-screen TIME despite short text (a slow, deliberately-paced
                // sentence with no internal punctuation for splitTextByPunctuation
                // to work with) - each piece's likely duration is estimated by its
                // share of the caption's original text length, and anything still
                // over maxDuration gets halved near its middle, repeating until
                // every piece is estimated under the cap or can't usefully split
                // further (down to a single word). Timing for the final pieces is
                // divided proportionally by character count, same as a manual
                // Split - there's no word-level timing left to split on after the
                // fact, so all pieces are marked approximated for review.
                let splitCount = 0;
                for (let i = captions.length - 1; i >= 0; i--) {
                    const caption = captions[i];
                    if (!isFixableBySplit(caption)) {
                        continue;
                    }

                    const duration = caption.end - caption.start;
                    const totalChars = caption.text.length;

                    let pieces = this.splitTextByPunctuation(caption.text, settings.targetChars, settings.maxChars);

                    let changed = true;
                    while (changed) {
                        changed = false;
                        const next = [];
                        for (const piece of pieces) {
                            const estimatedDuration = duration * (piece.length / totalChars);
                            const halves = estimatedDuration > settings.maxDuration
                                ? this.splitTextNearMiddle(piece)
                                : [piece];
                            if (halves.length > 1) {
                                changed = true;
                            }
                            next.push(...halves);
                        }
                        pieces = next;
                    }

                    if (pieces.length <= 1) {
                        continue;
                    }

                    const finalTotalChars = pieces.reduce((sum, p) => sum + p.length, 0);
                    let cursor = caption.start;
                    const newPieces = pieces.map((text, pieceIndex) => {
                        const isLast = pieceIndex === pieces.length - 1;
                        const start = cursor;
                        const end = isLast ? caption.end : cursor + duration * (text.length / finalTotalChars);
                        cursor = end;
                        return { index: 0, start, end, text, approximated: true };
                    });

                    captions.splice(i, 1, ...newPieces);
                    splitCount++;
                }

                // Pass 2: merge a too-brief/too-fast caption into an adjacent one
                // when it looks like a fragment of the same clause rather than a
                // genuinely complete short caption - a real sentence essentially
                // never ends without terminal punctuation, so a caption whose text
                // doesn't end in one was almost certainly cut off mid-clause,
                // continuing into whatever comes next. Tries merging forward first
                // (into the next caption) since that's the far more common shape;
                // falls back to merging backward only when the PREVIOUS caption is
                // the one missing its terminal punctuation instead (this caption
                // completes it). Only merges when the combined text and duration
                // both fit within settings, so this never trades one flagged
                // caption for a newly-oversized one - and runs before the extend
                // pass below, so a fragment that can be sensibly completed doesn't
                // get artificially stretched in place instead. Reverse order for
                // the same splice-safety reason as the split pass above.
                const endsSentence = (text) => /[.!?]\s*$/.test(text.trim());
                let mergedCount = 0;
                for (let i = captions.length - 1; i >= 0; i--) {
                    const caption = captions[i];
                    if (!isFixableTiming(caption)) {
                        continue;
                    }

                    const next = captions[i + 1];
                    if (next && !endsSentence(caption.text)) {
                        const mergedText = `${caption.text} ${next.text}`.trim();
                        const mergedDuration = next.end - caption.start;
                        if (mergedText.length <= settings.maxChars && mergedDuration <= settings.maxDuration) {
                            next.text = mergedText;
                            next.start = caption.start;
                            delete next.matchConfidence;
                            delete next.approximated;
                            captions.splice(i, 1);
                            mergedCount++;
                            continue;
                        }
                    }

                    const prev = captions[i - 1];
                    if (prev && !endsSentence(prev.text)) {
                        const mergedText = `${prev.text} ${caption.text}`.trim();
                        const mergedDuration = caption.end - prev.start;
                        if (mergedText.length <= settings.maxChars && mergedDuration <= settings.maxDuration) {
                            prev.text = mergedText;
                            prev.end = caption.end;
                            delete prev.matchConfidence;
                            delete prev.approximated;
                            captions.splice(i, 1);
                            mergedCount++;
                        }
                    }
                }

                // Pass 3: extend duration for anything still too brief or too fast
                // - whatever merging couldn't sensibly resolve (a genuinely
                // complete short caption with no fitting merge candidate). Only
                // ever pushes the end time later, capped at the next caption's
                // start, so this can't introduce a new overlap; if there's no room
                // to reach the target, it gets as close as it safely can rather
                // than forcing it.
                const MIN_SLIVER = 0.05;
                let extendedCount = 0;
                for (let i = 0; i < captions.length; i++) {
                    const caption = captions[i];
                    if (!isFixableTiming(caption)) {
                        continue;
                    }

                    const next = captions[i + 1];
                    const ceiling = next ? Math.max(caption.start + MIN_SLIVER, next.start - MIN_SLIVER) : Infinity;
                    const neededForMinDuration = caption.start + settings.minDuration;
                    const neededForReadingSpeed = caption.start + (caption.text.length / settings.maxReadingSpeed);
                    const desiredEnd = Math.max(caption.end, neededForMinDuration, neededForReadingSpeed);
                    const newEnd = Math.min(desiredEnd, ceiling);

                    if (newEnd > caption.end) {
                        caption.end = newEnd;
                        extendedCount++;
                    }
                }

                this.renumberCaptions(captions);
                this.refreshFileState(fileName, captions);

                const remaining = captions.filter(c => {
                    const issues = this.evaluateCaptionIssues(c, settings, {});
                    return issues.some(i => !['TOO_BRIEF', 'TOO_FAST', 'TOO_LONG', 'TOO_LONG_DURATION'].includes(i.type));
                }).length;

                const parts = [];
                if (splitCount) parts.push(`split ${splitCount} caption${splitCount === 1 ? '' : 's'}`);
                if (mergedCount) parts.push(`merged ${mergedCount} caption${mergedCount === 1 ? '' : 's'}`);
                if (extendedCount) parts.push(`extended ${extendedCount} caption${extendedCount === 1 ? '' : 's'}`);
                const summary = parts.length ? parts.join(', ') : 'nothing needed fixing after all';
                const reviewNote = remaining ? ` ${remaining} caption${remaining === 1 ? '' : 's'} still flagged for manual review.` : '';
                this.showMessage(`Auto-fix: ${summary}.${reviewNote}`, 'success');
            },


            // Fixes a word/phrase consistently across caption text instead of
            // requiring per-caption manual edits. Scoped to either just the
            // currently-viewed file or every processed file, per the modal's
            // checkbox. Each touched file gets its own undo snapshot pushed
            // before it's modified, so Ctrl+Z on that file reverts just its
            // replacements - a fresh RegExp instance is used for every
            // test/match/replace call so a shared, stateful `lastIndex` (from
            // reusing one global-flag regex across many calls) can't cause a
            // match to be silently skipped.
            applyFindReplace() {
                const findText = document.getElementById('findText').value;
                const replaceText = document.getElementById('replaceText').value;
                const caseSensitive = document.getElementById('findReplaceCaseSensitive').checked;
                const allFiles = document.getElementById('findReplaceAllFiles').checked;

                if (!findText) {
                    this.showMessage('Enter text to find first.', 'warning');
                    return;
                }

                const flags = caseSensitive ? 'g' : 'gi';
                const escaped = this.escapeRegExp(findText);
                const currentFile = this.files[this.currentFileIndex];

                const targets = allFiles
                    ? [...this.transcripts.keys()]
                    : (currentFile && this.transcripts.has(currentFile.name) ? [currentFile.name] : []);

                if (targets.length === 0) {
                    this.showMessage('No processed captions to search.', 'warning');
                    return;
                }

                let totalReplacements = 0;
                let filesChanged = 0;
                let currentFileChanged = false;

                targets.forEach(fileName => {
                    const captions = this.transcripts.get(fileName);
                    if (!captions) {
                        return;
                    }

                    const matchCount = captions.reduce((sum, caption) => {
                        const matches = caption.text.match(new RegExp(escaped, flags));
                        return sum + (matches ? matches.length : 0);
                    }, 0);
                    if (matchCount === 0) {
                        return;
                    }

                    this.pushUndoSnapshot(fileName, captions);

                    captions.forEach(caption => {
                        if (new RegExp(escaped, flags).test(caption.text)) {
                            // Replacer given as a function, not a string, so
                            // replacement text is always inserted literally -
                            // passed as a string, sequences like $&, $', $$
                            // would be interpreted as replacement patterns
                            // instead of literal characters the user typed.
                            caption.text = caption.text.replace(new RegExp(escaped, flags), () => replaceText);
                            delete caption.matchConfidence;
                            delete caption.approximated;
                        }
                    });

                    totalReplacements += matchCount;
                    filesChanged++;
                    if (currentFile && fileName === currentFile.name) {
                        currentFileChanged = true;
                    }

                    const whisperResult = this.whisperResults.get(fileName);
                    if (whisperResult) {
                        this.generateQualitySummary(fileName, captions, whisperResult.text);
                    }
                });

                if (totalReplacements === 0) {
                    this.showMessage(`No matches found for "${findText}".`, 'info');
                    return;
                }

                if (currentFileChanged) {
                    this.loadCurrentFile();
                    this.updateQualitySummaryForCurrentFile();
                }
                this.saveSessionSnapshot();

                document.getElementById('findReplaceOverlay').classList.remove('visible');
                this.showMessage(`Replaced ${totalReplacements} occurrence(s) across ${filesChanged} file(s).`, 'success');
            },


            // Parses and validates an edited start/end time field, applies it to the
            // caption if valid, and reverts the input's displayed text otherwise.
            // Deliberately a light-touch update (no full loadCurrentFile() rebuild) so
            // tabbing between time fields doesn't lose focus or scroll position - just
            // this card's badge and the quality summary numbers get refreshed.
            // Committing a start/end edit that would overlap the adjacent caption
            // auto-adjusts that neighbor's matching boundary instead of just
            // letting the overlap sit there for you to go fix by hand - moving
            // caption A's end past caption B's start pushes B's start forward to
            // meet it (and the mirror case for start edits pulls the previous
            // caption's end back). A tiny minimum sliver (MIN_SLIVER) stops either
            // caption from being squeezed to zero/negative duration; if a neighbor
            // ends up uncomfortably short from the adjustment, the existing
            // "too brief" quality check will flag it same as always.
            commitCaptionTimeEdit(fileName, index, role, input, card) {
                const captions = this.transcripts.get(fileName);
                const caption = captions && captions[index];
                if (!caption) {
                    return;
                }

                const revert = () => {
                    input.value = this.formatTime(role === 'start' ? caption.start : caption.end);
                };

                const parsed = this.parseTimeToSeconds(input.value);
                if (parsed === null) {
                    this.showMessage('Could not read that time - use HH:MM:SS.mmm (or just seconds).', 'warning');
                    revert();
                    return;
                }

                const MIN_SLIVER = 0.05;

                if (role === 'start' && parsed >= caption.end - MIN_SLIVER) {
                    this.showMessage('Start time must be before the end time.', 'warning');
                    revert();
                    return;
                }
                if (role === 'end' && parsed <= caption.start + MIN_SLIVER) {
                    this.showMessage('End time must be after the start time.', 'warning');
                    revert();
                    return;
                }

                this.pushUndoSnapshot(fileName, captions);

                let adjustedNeighbor = null;

                if (role === 'start') {
                    let newStart = parsed;
                    const prev = index > 0 ? captions[index - 1] : null;

                    if (prev && newStart < prev.end) {
                        newStart = Math.max(newStart, prev.start + MIN_SLIVER);
                        prev.end = newStart;
                        adjustedNeighbor = { caption: prev, card: this.captionCards[index - 1], role: 'end' };
                    }

                    caption.start = newStart;
                    input.value = this.formatTime(newStart);
                } else {
                    let newEnd = parsed;
                    const next = index < captions.length - 1 ? captions[index + 1] : null;

                    if (next && newEnd > next.start) {
                        newEnd = Math.min(newEnd, next.end - MIN_SLIVER);
                        next.start = newEnd;
                        adjustedNeighbor = { caption: next, card: this.captionCards[index + 1], role: 'start' };
                    }

                    caption.end = newEnd;
                    input.value = this.formatTime(newEnd);
                }

                // A manual edit is a deliberate, human-verified correction, so any
                // "please verify this timing" flag from automated matching no longer
                // applies.
                delete caption.matchConfidence;
                delete caption.approximated;

                if (adjustedNeighbor) {
                    delete adjustedNeighbor.caption.matchConfidence;
                    delete adjustedNeighbor.caption.approximated;

                    const neighborInput = adjustedNeighbor.card?.querySelector(`.time-input[data-role="${adjustedNeighbor.role}"]`);
                    if (neighborInput) {
                        neighborInput.value = this.formatTime(adjustedNeighbor.caption[adjustedNeighbor.role]);
                    }
                }

                const whisperResult = this.whisperResults.get(fileName);
                if (whisperResult) {
                    this.generateQualitySummary(fileName, captions, whisperResult.text);
                }
                this.updateQualitySummaryForCurrentFile();

                const settings = this.getCaptionSettings();
                const quality = this.qualityData.get(fileName);
                const issueContext = { mismatchCaptionIndex: quality?.textMatched?.mismatchCaptionIndex ?? null };
                this.updateIssueBadge(card, caption, settings, issueContext);
                this.updateCaptionStats(card, caption, settings);

                if (adjustedNeighbor && adjustedNeighbor.card) {
                    this.updateIssueBadge(adjustedNeighbor.card, adjustedNeighbor.caption, settings, issueContext);
                    this.updateCaptionStats(adjustedNeighbor.card, adjustedNeighbor.caption, settings);
                    this.showMessage("Adjusted the neighboring caption's timing to avoid an overlap.", 'success');
                }

                this.saveSessionSnapshot();
            },


            formatTime(seconds){

                const h = Math.floor(seconds / 3600);

                const m = Math.floor((seconds % 3600)/60);

                const s = (seconds % 60).toFixed(3);

                return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${s.padStart(6,"0")}`;

            }
};
