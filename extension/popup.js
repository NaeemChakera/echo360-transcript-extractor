'use strict';

const $ = (id) => document.getElementById(id);
const DEFAULTS = { formats: ['txt'], combined: false, speakers: true };

let tabId = null;
let target = null; // { frameId, sectionId, title, ... }

// --------------------------------------------------------------- options --

async function loadOptions() {
  let o = DEFAULTS;
  try {
    o = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  } catch (_) {}
  document.querySelectorAll('input[name=format]').forEach((cb) => (cb.checked = o.formats.includes(cb.value)));
  $('combined').checked = !!o.combined;
  $('speakers').checked = !!o.speakers;
}

function readOptions() {
  const formats = [...document.querySelectorAll('input[name=format]:checked')].map((cb) => cb.value);
  return { formats: formats.length ? formats : ['txt'], combined: $('combined').checked, speakers: $('speakers').checked };
}

document.addEventListener('change', () => {
  chrome.storage.sync.set(readOptions()).catch(() => {});
});

// ------------------------------------------------------------- detection --

/**
 * Find the Echo360 course in the tab. The content script runs in every
 * Echo360 frame (including one embedded in Canvas); course frames answer
 * first, other Echo360 frames answer a moment later.
 */
async function findEchoFrame() {
  try {
    const info = await chrome.tabs.sendMessage(tabId, { type: 'echoTx:probe' });
    if (info) return info;
  } catch (_) {
    // No Echo360 frame (or it was opened before the extension was installed).
  }
  return { none: true };
}

// ------------------------------------------------------------- rendering --

function showHelp(html) {
  $('help').innerHTML = html;
  $('help').hidden = false;
}

function renderDetect() {
  $('help').hidden = true;
  if (!target || target.none) {
    $('detect-status').textContent = 'No Echo360 course found on this page.';
    $('course').hidden = true;
    showHelp(`
      <p><strong>How to use:</strong></p>
      <ol>
        <li>Open your course in Canvas (or your school's LMS).</li>
        <li>Click the course's <em>Echo360</em> / <em>Lecture Capture</em> / <em>Recordings</em> link so the list of recordings shows.</li>
        <li>Open this popup again and click Download.</li>
      </ol>
      <p class="muted">Just installed or updated the extension? Reload the page first.</p>`);
    $('start').disabled = true;
    return;
  }
  if (!target.sectionId) {
    $('detect-status').textContent = 'Echo360 is open, but not on a course’s list of recordings.';
    $('course').hidden = true;
    showHelp('<p>Go back to the course page that lists all the recordings, then try again.</p>');
    $('start').disabled = true;
    return;
  }
  $('detect-status').textContent = 'Echo360 course found:';
  $('course').textContent = target.title || target.host;
  $('course').hidden = false;
  $('start').disabled = !!(target.job && !['done', 'error'].includes(target.job.phase));
}

function renderJob(state) {
  if (!state) return;
  const box = $('progress');
  box.hidden = false;
  box.classList.toggle('ok', state.phase === 'done');
  box.classList.toggle('err', state.phase === 'error');
  $('progress-text').textContent = state.message || '';
  const pct = state.phase === 'done' ? 100 : state.total ? Math.round((state.processed / state.total) * 100) : 3;
  $('bar-fill').style.width = `${pct}%`;
  $('progress-counts').textContent = state.total
    ? `${state.processed} of ${state.total} recordings checked · ${state.found} transcript${state.found === 1 ? '' : 's'}`
    : '';
  const skipped = [...(state.missing || []), ...(state.failed || [])];
  $('missing-wrap').hidden = !skipped.length;
  $('missing-summary').textContent = `${skipped.length} skipped (no transcript or error)`;
  $('missing').replaceChildren(
    ...skipped.map((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      return li;
    })
  );
  const running = !['done', 'error'].includes(state.phase);
  $('start').disabled = running || !target || !target.sectionId;
  $('start').textContent = running ? 'Downloading…' : 'Download all transcripts (.zip)';
}

// ----------------------------------------------------------------- start --

$('start').addEventListener('click', async () => {
  if (!target || !target.sectionId) return;
  const options = readOptions();
  chrome.storage.sync.set(options).catch(() => {});
  $('start').disabled = true;
  renderJob({ phase: 'listing', message: 'Starting…', total: 0, processed: 0, found: 0 });
  try {
    const msg = { type: 'echoTx:start', options, sectionId: target.sectionId };
    const res =
      target.frameId === undefined
        ? await chrome.tabs.sendMessage(tabId, msg)
        : await chrome.tabs.sendMessage(tabId, msg, { frameId: target.frameId });
    if (!res || !res.ok) throw new Error((res && res.error) || 'The Echo360 page did not respond. Reload it and try again.');
  } catch (e) {
    renderJob({ phase: 'error', message: e.message || String(e) });
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'echoTx:progress' && sender.tab && sender.tab.id === tabId) renderJob(msg.state);
});

// ------------------------------------------------------------------ init --

(async function init() {
  await loadOptions();
  const param = new URLSearchParams(location.search).get('tabId'); // for testing
  if (param) tabId = Number(param);
  else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab && tab.id;
  }
  if (tabId == null) return;

  try {
    const saved = (await chrome.storage.session.get(`job:${tabId}`))[`job:${tabId}`];
    if (saved) renderJob(saved);
  } catch (_) {}

  target = await findEchoFrame();
  renderDetect();
  if (target && target.job) renderJob(target.job);
})();
