// End-to-end: load the unpacked extension in Chromium, serve a fake Canvas
// page that embeds a fake Echo360 course in an iframe, click Download in the
// popup and check the ZIP that comes out.
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const F = require('./fixtures.js');

const MODE = process.argv[2] || 'syllabus'; // 'syllabus' | 'dom' (syllabus returns HTML shell)
const EXT = path.resolve(__dirname, '../extension');
const hits = [];

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  const url = new URL(req.url, `http://${host}`);
  const p = decodeURI(url.pathname);
  hits.push(`${host}${p}`);
  const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };

  if (host === 'canvas.test') {
    return send(200, 'text/html', `<h1>Canvas</h1><iframe id="tool" src="http://echo360.org/section/${F.SECTION}/home" width=800 height=600></iframe>`);
  }
  if (host === 'echo360.org') {
    if (p === `/section/${F.SECTION}/home`) {
      const rows = [F.L1, F.L2, F.L3, F.L4, F.L5].map((id, i) =>
        `<div class="class-row" data-test-lessonid="${id}"><span class="header">Lecture ${i + 1}</span></div>`).join('');
      return send(200, 'text/html', `<title>Echo360</title><div class="course-section-header"><h1>BIOL 101 - Fall</h1></div>${rows}`);
    }
    if (p === `/section/${F.SECTION}/syllabus`) {
      if (MODE === 'dom') return send(200, 'text/html', '<div id="app"></div>');
      return send(200, 'application/json', JSON.stringify(F.syllabus));
    }
    const lc = p.match(/^\/lesson\/(.+)\/classroom$/);
    if (lc) {
      const map = { [F.L1]: F.M1, [F.L2]: F.M2, [F.L4]: F.M4, [F.L5]: F.M5 };
      const m = map[lc[1]];
      return send(200, 'text/html', m ? `<script>Echo["classroomApp"]("{\\"mediaId\\":\\"${m}\\"}")</script>` : '<p>none</p>');
    }
    const t = p.match(/^\/api\/ui\/echoplayer\/lessons\/(.+)\/medias\/([^/]+)\/(transcript|transcript-file)$/);
    if (t) {
      const k = `${t[1]}|${t[2]}`;
      if (t[3] === 'transcript' && F.transcripts[k]) return send(200, 'application/json', JSON.stringify(F.transcripts[k]));
      if (t[3] === 'transcript-file' && F.vttOnly[k]) return send(200, 'text/vtt', F.vttOnly[k]);
      return send(404, 'application/json', '{"status":"error"}');
    }
  }
  send(404, 'text/plain', 'nope');
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-'));
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    headless: true,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      `--host-resolver-rules=MAP canvas.test 127.0.0.1:${port}, MAP echo360.org 127.0.0.1:${port}`,
      '--no-proxy-server',
    ],
    acceptDownloads: true,
    downloadsPath: dlDir,
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;

    const page = await ctx.newPage();
    await page.goto('http://canvas.test/courses/1/external_tools/2');
    await page.frameLocator('#tool').locator('h1').waitFor();
    await page.waitForTimeout(500);

    const tabId = await sw.evaluate(async () => Math.max(...(await chrome.tabs.query({})).map((t) => t.id)));
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
    await popup.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 10000 });
    console.log('detected course:', await popup.textContent('#course'));
    await popup.check('input[value=vtt]');
    await popup.check('#combined');
    await popup.click('#start');
    await popup.waitForFunction(() => /Saved|error|None|No /.test(document.getElementById('progress-text').textContent) &&
      document.getElementById('progress').className.match(/ok|err/), null, { timeout: 30000 });
    console.log('popup says:', await popup.textContent('#progress-text'));
    console.log('counts:', await popup.textContent('#progress-counts'));

    const items = await sw.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        const d = await chrome.downloads.search({});
        if (d.length && d[0].state === 'complete') return d;
        await new Promise((r) => setTimeout(r, 200));
      }
      return chrome.downloads.search({});
    });
    const item = items[0];
    console.log('download:', item && item.filename, item && item.state);
    const listing = execFileSync('python3', ['-c', `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
for n in z.namelist(): print(n)
print('-----'); print(z.read([n for n in z.namelist() if n.endswith('.txt') and n.split('/')[-1].startswith('01')][0]).decode())
print('-----'); print(z.read([n for n in z.namelist() if 'report' in n][0]).decode())`, item.filename]).toString();
    console.log(listing);
  } finally {
    await ctx.close();
    server.close();
  }
})().catch((e) => { console.error(e); console.error('hits:', hits.join('\n')); process.exit(1); });
