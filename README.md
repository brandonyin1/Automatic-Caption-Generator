# Automatic Caption Generator

A single-file, no-build-step HTML tool for turning audio/video into edited, exportable captions. Open the HTML file directly in a browser — nothing to install, nothing to run.

## What it does

1. **Transcribe** audio or video via [OpenAI Whisper](https://platform.openai.com/docs/guides/speech-to-text) or [ElevenLabs Scribe](https://elevenlabs.io/speech-to-text) (your choice, per file batch). Large files are automatically chunked to stay under each provider's upload limit and stitched back together; video files have audio extracted client-side before upload.
2. **Segment into captions**, either rule-based (deterministic, free, instant - sentence/pause/duration-aware) or AI-assisted (asks a GPT model to group the text, with the rule-based limits still enforced underneath as a safety net).
3. **Edit** the result directly in the browser: fix text, adjust timestamps, merge/split/insert/delete captions, find-and-replace across one or all files, full undo history, all with autosave.
4. **Export** as SRT or WebVTT.

Along the way it also flags quality issues per caption (too long/brief on screen, reading speed, uncertain word matches, text divergence from the original transcript) and periodically saves your caption/transcript work in the browser so a crashed tab or reload doesn't cost you the edits.

## Usage

Open `Automatic Caption Generator v2.html` in a Chromium-based browser (custom save-location picking and drag-and-drop rely on the File System Access API, Chromium-only; the rest works in any modern browser). You'll need an API key for whichever transcription provider you use - entered once in Settings, optionally remembered in `localStorage` for next time. No server, no account, no data leaves your browser except the direct API calls to OpenAI/ElevenLabs.

## Files

- **`Automatic Caption Generator v2.html`** - the current, actively maintained version. This is the one to use.
- **`Automatic Caption Generator - old.html`** - the original single-shot version, kept for reference. It had no editing capability and no persistence of any kind.
- **`CHANGES.md`** - a detailed comparison of what's changed between the two.

## License

MIT - see [LICENSE](LICENSE).
