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
| `downloads` | Saves the ZIP file of transcripts that the user asked to download to their computer. |
| `storage` | Remembers the user's chosen formats and shows download progress if the popup is closed and reopened. Stored locally only. |
| `scripting` | Lets the popup detect the Echo360 course frame on the current page (for example, Echo360 embedded inside Canvas), including pages opened before the extension was installed. |
| `activeTab` | When the user clicks the extension icon, lets it check the current page for an embedded Echo360 course. It has no access to pages the user hasn't clicked on. |
| Host permissions (`*.echo360.org`, `.org.uk`, `.org.au`, `.net.au`, `.ca`, `.com`, `.net`) | Required to read the course's list of recordings and their transcripts from Echo360, using the user's existing Echo360 session. These are Echo360's regional cloud domains. No other sites are accessed. |

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
