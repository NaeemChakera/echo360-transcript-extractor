# Chrome Web Store listing

Copy and paste these into the Developer Dashboard.

## Store listing tab

**Category:** Tools (Education also fits)
**Language:** English
**Mature content:** No

### Description

```
Download every lecture transcript in your Echo360 course in one click, neatly named and zipped.

If your classes are recorded with Echo360, every lecture can have a transcript. Saving them one by one is slow. Echo360 Transcript Extractor grabs all of them at once and hands you a single ZIP, ready for searching, studying, note-taking or accessibility tools.

HOW IT WORKS
1. Open your course's Echo360 recordings page (for example, the Echo360 or "Lecture Capture" link inside Canvas).
2. Click the extension icon.
3. Click "Download all transcripts". That's it.

FEATURES
• Downloads every transcript in the course, not just the lecture you're watching
• Works when Echo360 is embedded in Canvas, Moodle, Blackboard, D2L/Brightspace, or opened directly
• Works at any school on Echo360's cloud: US, UK/EU, Australia/NZ and Canada
• Choose your formats: readable text, text with timestamps, WebVTT (.vtt) or SRT (.srt) captions
• Optional single file containing the whole course's transcripts
• Speaker names included when Echo360 provides them
• Files are numbered and dated in lecture order, e.g. "03 - 2026-09-01 - Lecture 3.txt"
• A download report lists any recording that has no transcript, so you know exactly what you have
• Runs in the background, so you can close the popup while it works

PRIVATE BY DESIGN
• Uses the Echo360 sign-in you already have. It never asks for or stores passwords.
• Talks only to Echo360. No analytics, no tracking, no outside servers.
• Everything, including building the ZIP, happens on your computer.

GOOD TO KNOW
• Transcripts only exist for recordings where your instructor or school turned on captions/transcription.
• Only download course material you're permitted to keep under your school's policies.

This is an independent tool. It is not affiliated with or endorsed by Echo360, Instructure (Canvas), or any university.
```

### Graphic assets (in `store/assets/`)

| Field | File |
|---|---|
| Store icon (128×128) | `store-icon-128.png` |
| Screenshots (1280×800), in this order | `screenshot-1.png` … `screenshot-4.png` |
| Small promo tile (440×280) | `small-promo-440x280.png` |
| Marquee promo tile (1400×560) | `marquee-1400x560.png` |

To regenerate them: `node store/make-assets.js`

### URLs

The GitHub repo is private, so links to it would show a 404 for everyone else. Either make the repo public and use:
- Homepage URL: `https://github.com/NaeemChakera/echo360-transcripts`
- Support URL: `https://github.com/NaeemChakera/echo360-transcripts/issues`

Or leave both blank.

## Privacy practices tab

**Single purpose:**
```
Downloads the transcripts of all recordings in an Echo360 course and saves them to the user's computer as a single ZIP file.
```

**Permission justifications:**

| Permission | Justification |
|---|---|
| `downloads` | Used to save the ZIP file of transcripts, which the user explicitly asked for by clicking "Download all transcripts", to the user's computer. |
| `storage` | Stores the user's chosen download formats and the progress of the current download, so the popup can show status if it is closed and reopened. Stored locally only; nothing is sent anywhere. |
| Host permission (content script on `*.echo360.org`, `.org.uk`, `.org.au`, `.net.au`, `.ca`, `.com`, `.net`) | The extension runs only on Echo360's regional cloud domains (US, UK/EU, Australia/NZ, Canada) so it can read the course's list of recordings and their transcripts using the user's existing Echo360 session, including when Echo360 is embedded inside an LMS such as Canvas. No other websites are accessed. |

**Remote code:** No, I am not using remote code.

**Data usage:** under "What user data do you plan to collect", check nothing. The extension reads course content from Echo360 only to save it to the user's own computer, and nothing is sent to the developer or any third party. Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** if the form requires one, make the repo public and use `https://github.com/NaeemChakera/echo360-transcripts/blob/main/PRIVACY.md`.

## Distribution tab

- **Visibility:**
  - **Unlisted** – only people with the link can install it. Good while you're testing on real courses.
  - **Public** – anyone can find it in the Web Store.
- **Regions:** All regions.
