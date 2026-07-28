# Automatic Caption Generator

A single-file HTML tool for turning audio/video into edited, exportable captions. To use it: open the HTML file directly in a browser — nothing to install, nothing to run. (Developing it is a different story - see [Development](#development) below.)

## Download

**[Get the latest release here](https://github.com/brandonyin1/Automatic-Caption-Generator/releases/latest)** - this is the intended way to get the files, not cloning the repo or browsing source. Each release has two assets:

- `Automatic Caption Generator v2.html` - open it in a browser, that's it.
- `Automatic Caption Generator Setup *.exe` - optional Windows desktop app with File Explorer "Send To" integration. See [below](#desktop-app-optional---windows-send-to-integration).

## What it does

1. **Transcribe** audio or video via [OpenAI Whisper](https://platform.openai.com/docs/guides/speech-to-text) or [ElevenLabs Scribe](https://elevenlabs.io/speech-to-text) (your choice, per file batch). Large files are automatically chunked to stay under each provider's upload limit and stitched back together; video files have audio extracted client-side before upload.
2. **Segment into captions**, either rule-based (deterministic, free, instant - sentence/pause/duration-aware) or AI-assisted (asks a GPT model to group the text, with the rule-based limits still enforced underneath as a safety net).
3. **Edit** the result directly in the browser: fix text, adjust timestamps, merge/split/insert/delete captions, find-and-replace across one or all files, full undo history, all with autosave.
4. **Export** as SRT or WebVTT.

Along the way it also flags quality issues per caption (too long/brief on screen, reading speed, uncertain word matches, text divergence from the original transcript) and periodically saves your caption/transcript work in the browser so a crashed tab or reload doesn't cost you the edits.

## Usage

Open `Automatic Caption Generator v2.html` (from the [latest release](https://github.com/brandonyin1/Automatic-Caption-Generator/releases/latest)) in a Chromium-based browser (custom save-location picking and drag-and-drop rely on the File System Access API, Chromium-only; the rest works in any modern browser). You'll need an API key for whichever transcription provider you use - entered once in Settings, optionally remembered in `localStorage` for next time. No server, no account, no data leaves your browser except the direct API calls to OpenAI/ElevenLabs.

## Development

`Automatic Caption Generator v2.html` is a **build artifact** - don't hand-edit it directly, edits will be overwritten by the next build. The actual source lives in `src/`:

- `src/index.html` - the page markup
- `src/styles/` - CSS, split by area (theme, layout, components, viewer)
- `src/core/CaptionGenerator.js` - the class shell (constructor only)
- `src/features/*.js` - the class's methods, grouped by concern (transcription, segmentation, editing, session recovery, etc.) - each exports a plain object of methods that `build.js` composes onto the class prototype
- `src/bootstrap.js` - app init + window lifecycle listeners

```
npm run build
```

regenerates `Automatic Caption Generator v2.html` from `src/`, byte-for-byte the same single file this tool has always shipped as - no bundler, no dependencies. Usage (above) is completely unaffected: opening that file directly in a browser works exactly the same either way.

## Desktop app (optional) - Windows "Send To" integration

Adds the app as a Windows Explorer "Send To" target - select one or more audio/video files, right-click → Send To → Automatic Caption Generator, and they open pre-loaded. This is purely additive: opening the HTML file directly in a browser (above) still works exactly the same and needs none of this.

**Easiest path:** download `Automatic Caption Generator Setup *.exe` from the [latest release](https://github.com/brandonyin1/Automatic-Caption-Generator/releases/latest), run it, then open Settings inside the app and enable "Send To integration". Windows SmartScreen will likely warn about an unknown publisher on first run (the app isn't code-signed) - click "More info" → "Run anyway".

**Running from source instead**, via the `electron/` folder:

```
cd electron
npm install
npm start
```

Once running, open Settings and enable "Send To integration" the same way. To build your own installable executable instead of using the one from Releases:

```
cd electron
npm run build
```

The installer/executable is written to `electron/dist/`. Re-enable Send To integration from Settings after installing, so the shortcut points at the installed executable rather than the dev-mode path. Windows-only; the toggle doesn't appear on other platforms.

## Files

- **`Automatic Caption Generator v2.html`** - the current, actively maintained version. This is the one to open in a browser - but it's generated from `src/`, not hand-edited (see [Development](#development)).
- **`src/`, `build.js`, `package.json`** - the actual source and build tooling for the file above.
- **`legacy/Automatic Caption Generator - old.html`** - the original single-shot version, kept for reference. It had no editing capability and no persistence of any kind.
- **`electron/`** - the optional desktop wrapper (Send To integration), described above.
- **`CHANGES.md`** - a detailed comparison of what's changed between the two HTML versions.

## License

MIT - see [LICENSE](LICENSE).
