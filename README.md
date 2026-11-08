# Echo360 Transcripts

A Chrome extension that downloads **every transcript in an Echo360 course** as one ZIP file. It doesn't download any video. The Chrome Extension is now on the Chrome Web Store at https://chromewebstore.google.com/detail/aphnjehinnlmbkjlkgjjmejkeaceaodp?utm_source=item-share-cb.

It works at any school that uses Echo360's cloud service:

| Region | Domain |
|---|---|
| US | `echo360.org` |
| UK / EU | `echo360.org.uk`, `eu.echo360.org` |
| Australia / NZ | `echo360.org.au`, `echo360.net.au` |
| Canada | `echo360.ca` |
| Other | `echo360.com`, `echo360.net` |

It also works no matter how you open Echo360: inside **Canvas**, Moodle, Blackboard or D2L, or directly on the Echo360 site.

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `extension/` folder.
5. Pin the extension (click the puzzle-piece icon, then the pin).

It also works in Edge, Brave and Arc, which run Chrome extensions.

## Use

1. Open your course in Canvas and click the course's **Echo360** link. Some schools label it "Lecture Capture" or "Recordings". Wait until the list of recordings appears.
2. Click the extension icon.
3. Pick your formats and click **Download all transcripts (.zip)**.

You can close the popup while it works; the download keeps going.

### What's in the ZIP

```
BIOL 101 - Echo360 transcripts.zip
└── BIOL 101/
    ├── 01 - 2026-08-25 - Lecture 1 Intro.txt
    ├── 02 - 2026-08-27 - Lecture 2 Cells.txt
    ├── …
    ├── All transcripts.txt        (optional: everything in one file)
    └── _download report.txt       (what was saved and what had no transcript)
```

**Formats:**
- **Text** (`.txt`): readable paragraphs with speaker names.
- **Text with timestamps** (`.txt`): one line per caption, e.g. `[12:34] …`.
- **WebVTT** (`.vtt`) and **SRT** (`.srt`): caption files that video players can load.

If you choose more than one format, each gets its own folder.

## How it works

Canvas opens Echo360 in an iframe, and that iframe is already signed in to Echo360 for you. The extension runs a content script **inside the Echo360 frame**, so every request uses that session. It needs no passwords or API keys and never contacts Canvas.

1. **List the recordings.** It requests `GET /section/{sectionId}/syllabus`. If that doesn't return JSON (some newer Echo360 builds don't), it reads the recording rows on the page instead.
2. **Find each recording's media ID.** It takes these from the syllabus. If the syllabus doesn't have them, it reads them from the lesson page.
3. **Fetch the transcript.** It tries `GET /api/ui/echoplayer/lessons/{lessonId}/medias/{mediaId}/transcript` (JSON), then `…/transcript-file?format=vtt`.
4. **Build and save the ZIP.** The background worker builds the ZIP in the browser and saves it with `chrome.downloads`.

The extension makes 4 requests at a time and retries on rate limits.

### Privacy

- The extension talks only to Echo360, using your existing session.
- No analytics and no outside servers.
- It asks for only two permissions, `downloads` and `storage`, and runs only on Echo360 domains.

## Limitations

- Echo360 doesn't publish these endpoints, so they may change. If a download fails, open `_download report.txt` and file an issue with what it says.
- Recordings only have transcripts if your instructor turned on captions/transcription. Recordings without one are listed in the report.
- Self-hosted "classic" Echo360 (ESS) on a university's own domain isn't supported yet.
- Only download material you're allowed to keep under your school's policies.

## Development

```bash
npm test            # unit tests (parsers, renderers, ZIP writer)
npm run test:e2e    # loads the extension in Chromium against a fake Canvas + Echo360
npm run package     # zip the extension/ folder for the Chrome Web Store
```

The end-to-end test needs Playwright with Chromium.

## Tested at

- Colorado State University

| File | What it does |
|---|---|
| `extension/manifest.json` | Manifest V3 |
| `extension/content.js` | Runs in Echo360 frames; lists lessons and fetches transcripts |
| `extension/lib/transcript.js` | Parsers and `.txt`/`.vtt`/`.srt` renderers (also used by the tests) |
| `extension/lib/zip.js` | Dependency-free ZIP writer (deflate via `CompressionStream`) |
| `extension/background.js` | Builds the ZIP and saves it |
| `extension/popup.*` | The popup UI |

Made by Naeem Chakera, Colorado State University (with assistance from Claude)
