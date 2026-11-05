// Generates Chrome Web Store images into store/assets/.
// Captures the real popup (running against a mock course), then composes
// marketing frames with Playwright. Run: node store/make-assets.js
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '../extension');
const OUT = path.join(__dirname, 'assets');
fs.mkdirSync(OUT, { recursive: true });

const SECTION = '11111111-2222-3333-4444-555555555555';
const topics = ['Introduction & Syllabus', 'Cell Structure', 'Membranes & Transport', 'Cellular Respiration', 'Photosynthesis',
  'The Cell Cycle', 'Meiosis', 'Mendelian Genetics', 'DNA Replication', 'Transcription', 'Translation', 'Gene Regulation',
  'Biotechnology', 'Evolution I', 'Evolution II', 'Speciation', 'Phylogenetics', 'Prokaryotes', 'Protists', 'Plant Diversity',
  'Fungi', 'Animal Diversity', 'Ecology', 'Review Session'];
const lessons = topics.map((t, i) => {
  const d = new Date(Date.UTC(2026, 7, 25 + Math.floor(i / 2) * 7 + (i % 2) * 2, 16));
  const iso = d.toISOString().slice(0, 10);
  const mid = `aaaaaaaa-0000-0000-0000-${String(i + 1).padStart(12, '0')}`;
  return { id: `G_${SECTION}_l${i}_${iso}T10:00:00.000_${iso}T10:50:00.000`, name: `Lecture ${i + 1}: ${t}`, mid, iso, has: i !== 12 && i !== 23 };
});
const syllabus = { status: 'ok', data: lessons.map((l) => ({ lesson: { lesson: { id: l.id, name: l.name }, startTimeUTC: `${l.iso}T16:00:00.000Z`, hasVideo: true, medias: [{ id: l.mid }], video: { published: { courseName: 'BIOL 101' } } } })) };
const cues = [
  ['Good morning everyone, let’s get started.', 'Instructor'],
  ['Today we’re picking up where we left off last week.', 'Instructor'],
];

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  const p = decodeURI(new URL(req.url, 'http://x').pathname);
  const send = (c, t, b) => { res.writeHead(c, { 'content-type': t }); res.end(b); };
  if (host === 'lms.test') return send(200, 'text/html', `<iframe src="http://echo360.org/section/${SECTION}/home" style="border:0;width:100%;height:95vh"></iframe>`);
  if (p === `/section/${SECTION}/home`) return send(200, 'text/html', `<title>Echo360</title><h1 class="x">BIOL 101 - Introduction to Biology</h1>`);
  if (p === `/section/${SECTION}/syllabus`) return send(200, 'application/json', JSON.stringify(syllabus));
  const t = p.match(/lessons\/(.+)\/medias\/([^/]+)\/transcript$/);
  if (t) {
    const l = lessons.find((x) => x.id === t[1]);
    if (l && l.has) return setTimeout(() => send(200, 'application/json', JSON.stringify({ data: { contentJSON: { cues: cues.map(([c, s], i) => ({ startMs: i * 3000, endMs: i * 3000 + 2900, content: c, speaker: s })) } } })), 120);
  }
  send(404, 'text/plain', '');
});

const png = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pw-')), {
    headless: true, channel: 'chromium', deviceScaleFactor: 2, colorScheme: 'light',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--host-resolver-rules=MAP lms.test 127.0.0.1:${port}, MAP echo360.org 127.0.0.1:${port}`, '--no-proxy-server'],
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;
    const page = await ctx.newPage();
    await page.goto('http://lms.test/');
    await page.waitForTimeout(800);
    const tabId = await sw.evaluate(async () => Math.max(...(await chrome.tabs.query({})).map((t) => t.id)));

    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 340, height: 700 });
    await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
    await popup.waitForFunction(() => !document.getElementById('start').disabled);
    await popup.check('input[value=timestamps]');
    await popup.check('input[value=vtt]');
    await popup.check('#combined');
    const shot = async (name) => {
      const h = await popup.evaluate(() => document.body.scrollHeight);
      await popup.setViewportSize({ width: 340, height: h });
      await popup.screenshot({ path: path.join(OUT, name) });
    };
    await shot('_popup-ready.png');
    await popup.click('#start');
    await popup.waitForFunction(() => { const m = document.getElementById('progress-counts').textContent.match(/^(\d+) of/); return m && +m[1] >= 11 && +m[1] <= 16; });
    await shot('_popup-progress.png');
    await popup.waitForFunction(() => document.getElementById('progress').classList.contains('ok'), null, { timeout: 30000 });
    await popup.evaluate(() => (document.getElementById('missing-wrap').open = true));
    await shot('_popup-done.png');
    const cleanup = () => ['_popup-ready.png', '_popup-progress.png', '_popup-done.png'].forEach((f) => fs.rmSync(path.join(OUT, f), { force: true }));

    // ---- compose store images
    const icon = png(path.join(EXT, 'icons/icon128.png'));
    const css = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a}
      .bg{position:absolute;inset:0;background:linear-gradient(135deg,#eef4ff 0%,#dbe7ff 55%,#c7d8ff 100%)}
      .wrap{position:relative;display:flex;align-items:center;height:100%;padding:0 80px;gap:64px}
      .copy{flex:1}.copy h1{font-size:50px;line-height:1.1;margin:0 0 20px;letter-spacing:-.02em}
      .copy p{font-size:22px;line-height:1.5;color:#334155;margin:0 0 14px}
      .pill{display:inline-block;background:#2563eb;color:#fff;border-radius:999px;padding:6px 14px;font-weight:600;font-size:16px;margin-bottom:18px}
      .shot{border-radius:14px;box-shadow:0 24px 60px rgba(15,23,42,.25);background:#fff;overflow:hidden}
      .tree{font:18px/1.75 ui-monospace,Menlo,Consolas,monospace;background:#0f172a;color:#e2e8f0;padding:28px 32px;border-radius:14px;box-shadow:0 24px 60px rgba(15,23,42,.3);width:560px;white-space:nowrap}
      .tree .d{color:#93c5fd}.tree .m{color:#94a3b8}`;
    const comp = await ctx.newPage();
    const render = async (file, w, h, body, type = 'png') => {
      await comp.setViewportSize({ width: w, height: h });
      await comp.setContent(`<html><head><style>${css}html,body{width:${w}px;height:${h}px;overflow:hidden}</style></head><body><div class="bg"></div>${body}</body></html>`);
      await comp.screenshot({ path: path.join(OUT, file), type, ...(type === 'jpeg' ? { quality: 92 } : {}), omitBackground: false, scale: 'css' });
    };
    const popupImg = (f, hgt) => `<img class="shot" src="${png(path.join(OUT, f))}" style="height:${hgt}px">`;

    await render('screenshot-1.png', 1280, 800, `<div class="wrap"><div class="copy"><span class="pill">Echo360 + Canvas</span>
      <h1>Every lecture transcript.<br>One click.</h1><p>Open your course’s Echo360 recordings, click the extension, and get a ZIP with every transcript in the course.</p>
      <p>Works inside Canvas, Moodle, Blackboard and D2L, at any school on Echo360.</p></div>${popupImg('_popup-ready.png', 640)}</div>`);
    await render('screenshot-2.png', 1280, 800, `<div class="wrap"><div class="copy"><span class="pill">Fast &amp; private</span>
      <h1>Grabs the whole course in the background.</h1><p>Close the popup and keep studying. The download keeps going.</p>
      <p>Uses your existing Echo360 sign-in. No passwords, no outside servers, no tracking.</p></div>${popupImg('_popup-progress.png', 640)}</div>`);
    await render('screenshot-3.png', 1280, 800, `<div class="wrap"><div class="copy"><span class="pill">Organized for you</span>
      <h1>Named, dated and ready to search.</h1><p>Readable text, timestamped text, or .vtt / .srt caption files. Plus an optional single file with the whole course.</p>
      <p>A report lists any recording without a transcript.</p></div>
      <div class="tree"><div class="d">📦 BIOL 101 - Echo360 transcripts.zip</div>
      <div class="d">&nbsp;└─ BIOL 101/</div><div>&nbsp;&nbsp;&nbsp;&nbsp;├─ 01 - 2026-08-25 - Lecture 1 Intro.txt</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;├─ 02 - 2026-08-27 - Lecture 2 Cells.txt</div><div>&nbsp;&nbsp;&nbsp;&nbsp;├─ 03 - 2026-09-01 - Lecture 3 DNA.txt</div>
      <div class="m">&nbsp;&nbsp;&nbsp;&nbsp;├─ …</div><div>&nbsp;&nbsp;&nbsp;&nbsp;├─ All transcripts.txt</div><div>&nbsp;&nbsp;&nbsp;&nbsp;└─ _download report.txt</div></div></div>`);
    await render('screenshot-4.png', 1280, 800, `<div class="wrap"><div class="copy"><span class="pill">Done</span>
      <h1>22 transcripts saved.<br>Gaps clearly listed.</h1><p>Recordings without captions are listed, so you know exactly what you have.</p></div>${popupImg('_popup-done.png', 680)}</div>`);

    await render('small-promo-440x280.png', 440, 280, `<div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 34px">
      <img src="${icon}" width="64" height="64" style="margin-bottom:14px"><div style="font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1">Echo360 Transcript Extractor</div>
      <div style="font-size:16px;color:#334155;margin-top:8px">Every lecture transcript in a course → one ZIP</div></div>`);
    await render('marquee-1400x560.png', 1400, 560, `<div class="wrap" style="padding:0 100px"><div class="copy">
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:22px"><img src="${icon}" width="88" height="88"><div style="font-size:26px;font-weight:700;color:#1e3a8a">Echo360 Transcript Extractor</div></div>
      <h1 style="font-size:58px">Every lecture transcript.<br>One ZIP.</h1><p>Works inside Canvas and other LMSs, at any school on Echo360.</p></div>${popupImg('_popup-done.png', 470)}</div>`);

    // Store icon: 96px artwork with 16px transparent padding, per Web Store guidelines.
    await comp.setViewportSize({ width: 128, height: 128 });
    await comp.setContent(`<html><body style="margin:0;background:transparent"><img src="${icon}" style="width:96px;height:96px;margin:16px;display:block"></body></html>`);
    await comp.screenshot({ path: path.join(OUT, 'store-icon-128.png'), omitBackground: true, scale: 'css' });
    cleanup();
  } finally {
    await ctx.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
