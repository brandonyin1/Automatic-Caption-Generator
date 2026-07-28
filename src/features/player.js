export const playerMethods = {

            // Short M:SS (or H:MM:SS for anything over an hour) for the player's
            // time readouts - formatTime() above is deliberately full-precision
            // (HH:MM:SS.mmm) for captions, which is too fussy for a live counter.
            formatPlayerTime(seconds) {
                if (!isFinite(seconds) || seconds < 0) {
                    seconds = 0;
                }
                const h = Math.floor(seconds / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                const s = Math.floor(seconds % 60);

                if (h > 0) {
                    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                }
                return `${m}:${s.toString().padStart(2, '0')}`;
            },


            // Drives the custom player bar entirely through the <audio> element's
            // JS API, since native <audio controls> can't be reliably themed.
            setupCustomPlayer(audioPlayer) {
                const playPauseBtn = document.getElementById('playPauseBtn');
                const seekBar = document.getElementById('seekBar');
                const currentTimeDisplay = document.getElementById('currentTimeDisplay');
                const durationDisplay = document.getElementById('durationDisplay');
                const muteBtn = document.getElementById('muteBtn');
                const volumeBar = document.getElementById('volumeBar');

                let isSeeking = false;

                const updateSeekFill = () => {
                    const max = parseFloat(seekBar.max) || 0;
                    const pct = max > 0 ? (parseFloat(seekBar.value) / max) * 100 : 0;
                    seekBar.style.background = `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-border) ${pct}%)`;
                };

                const updateVolumeFill = () => {
                    const pct = (audioPlayer.muted ? 0 : audioPlayer.volume) * 100;
                    volumeBar.style.background = `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-border) ${pct}%)`;
                };

                const updateMuteIcon = () => {
                    muteBtn.textContent = (audioPlayer.muted || audioPlayer.volume === 0) ? '🔇' : '🔊';
                };

                playPauseBtn.addEventListener('click', () => {
                    if (audioPlayer.paused) {
                        audioPlayer.play();
                    } else {
                        audioPlayer.pause();
                    }
                });

                audioPlayer.addEventListener('play', () => {
                    playPauseBtn.classList.add('is-playing');
                });

                audioPlayer.addEventListener('pause', () => {
                    playPauseBtn.classList.remove('is-playing');
                });

                audioPlayer.addEventListener('ended', () => {
                    playPauseBtn.classList.remove('is-playing');
                });

                // Fires whenever a new src actually loads (not on our no-op-guarded
                // re-renders in loadCurrentFile), so this is the right place to reset
                // the bar's range/position for the newly loaded file.
                audioPlayer.addEventListener('loadedmetadata', () => {
                    seekBar.max = isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;
                    seekBar.value = 0;
                    durationDisplay.textContent = this.formatPlayerTime(audioPlayer.duration);
                    currentTimeDisplay.textContent = this.formatPlayerTime(0);
                    updateSeekFill();
                });

                audioPlayer.addEventListener('timeupdate', () => {
                    if (!isSeeking) {
                        seekBar.value = audioPlayer.currentTime;
                        updateSeekFill();
                    }
                    currentTimeDisplay.textContent = this.formatPlayerTime(audioPlayer.currentTime);
                });

                seekBar.addEventListener('mousedown', () => { isSeeking = true; });
                seekBar.addEventListener('touchstart', () => { isSeeking = true; }, { passive: true });
                // Listening on window (not just seekBar) catches release even if the
                // user drags off the slider before letting go.
                window.addEventListener('mouseup', () => { isSeeking = false; });
                window.addEventListener('touchend', () => { isSeeking = false; });

                seekBar.addEventListener('input', () => {
                    audioPlayer.currentTime = parseFloat(seekBar.value);
                    currentTimeDisplay.textContent = this.formatPlayerTime(audioPlayer.currentTime);
                    updateSeekFill();
                });

                muteBtn.addEventListener('click', () => {
                    audioPlayer.muted = !audioPlayer.muted;
                    updateMuteIcon();
                    updateVolumeFill();
                });

                volumeBar.addEventListener('input', () => {
                    audioPlayer.volume = parseFloat(volumeBar.value);
                    if (audioPlayer.volume > 0 && audioPlayer.muted) {
                        audioPlayer.muted = false;
                    }
                    updateMuteIcon();
                    updateVolumeFill();
                });

                updateSeekFill();
                updateVolumeFill();
                updateMuteIcon();
            },


            // Accepts the canonical HH:MM:SS.mmm format formatTime() produces, but
            // also anything looser - "5", "5.5", "1:05", "1:05.5" - so users don't
            // have to type the fully zero-padded form. Returns null on anything it
            // can't confidently parse as a non-negative time.
            parseTimeToSeconds(value) {
                const trimmed = (value || '').trim();
                if (!trimmed) {
                    return null;
                }

                const parts = trimmed.split(':');
                if (parts.length > 3 || parts.some(part => !/^\d+(\.\d+)?$/.test(part))) {
                    return null;
                }

                const numbers = parts.map(part => parseFloat(part));
                let seconds;
                if (numbers.length === 3) {
                    seconds = numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
                } else if (numbers.length === 2) {
                    seconds = numbers[0] * 60 + numbers[1];
                } else {
                    seconds = numbers[0];
                }

                return isFinite(seconds) && seconds >= 0 ? seconds : null;
            },


            updateCurrentCaption(){

                const audio =
                    document.getElementById("audioPlayer");

                const t = audio.currentTime;

                let active = -1;

                for(let i=0;i<this.currentCaptions.length;i++){

                    const c=this.currentCaptions[i];

                    if(t>=c.start && t<=c.end){

                        active=i;

                        break;

                    }

                }

                if(active===this.activeCaptionIndex)
                    return;

                this.setActiveCaption(active);

            },


            setActiveCaption(index){

                // Defensive: this.captionCards[this.activeCaptionIndex] can be
                // missing if something rebuilt the cards without going through
                // the index reset in loadCurrentFile() - guarding here means a
                // stale/out-of-bounds index just gets silently dropped instead
                // of throwing and permanently wedging future highlight updates
                // (see loadCurrentFile's comment on this.activeCaptionIndex).
                if(this.activeCaptionIndex >= 0 && this.captionCards[this.activeCaptionIndex]){

                    this.captionCards[
                        this.activeCaptionIndex
                    ].classList.remove("active");

                }

                this.activeCaptionIndex = index;

                if(index < 0)
                    return;

                const card = this.captionCards[index];

                if(!card)
                    return;

                card.classList.add("active");

                const rect = card.getBoundingClientRect();
                const container = document.getElementById("transcriptEditor").getBoundingClientRect();

                if (rect.top < container.top + 40 ||
                    rect.bottom > container.bottom - 40) {

                    card.scrollIntoView({
                        block: "nearest",
                        behavior: "smooth"
                    });

                }

            }
};
