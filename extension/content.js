/*
 * Runs inside every Echo360 page/frame — including the Echo360 iframe that
 * Canvas (or Moodle, Blackboard, D2L…) embeds. All requests are made from
 * here, same-origin, so they use the Echo360 session that the LMS already
 * signed you into. Nothing is sent anywhere except Echo360 itself.
 */
(() => {
  'use strict';
  if (globalThis.EchoTxContent) return;
  const T = globalThis.EchoTx;
  if (!T) return;

  const SECTION_RE = new RegExp('/section/(' + T.UUID_SRC + ')', 'i');
  const CONCURRENCY = 4;
  let job = null; // current progress state while running

  // ------------------------------------------------------------ page info --

  function findSectionId() {
    const m = location.pathname.match(SECTION_RE);
    if (m) return m[1];
    // e.g. on a lesson page there is usually a link back to the course
    for (const a of document.querySelectorAll('a[href*="/section/"]')) {
      const mm = (a.getAttribute('href') || '').match(SECTION_RE);
      if (mm) return mm[1];
    }
    return null;
  }

  function courseTitleFromDom() {
    const sel = [
      '.course-section-header h1',
      '[data-test-id="course-name"]',
      '[data-testid="course-name"]',
      '.section-header h1',
      'header h1',
      'h1',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      const t = el && el.textContent.replace(/\s+/g, ' ').trim();
      if (t && t.length < 150 && !/^echo\s*360$/i.test(t)) return t;
    }
    const title = document.title.replace(/\s*[|\-–]\s*Echo\s*360.*$/i, '').trim();
    return title && !/^echo\s*360$/i.test(title) ? title : '';
  }

  function probe() {
    return {
      sectionId: findSectionId(),
      onSectionPage: SECTION_RE.test(location.pathname),
      host: location.host,
      url: location.href,
      title: courseTitleFromDom(),
      job,
    };
  }

  // -------------------------------------------------------------- network --

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function get(url, accept) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { credentials: 'include', headers: { Accept: accept } });
      } catch (e) {
        if (attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw new Error('Network error');
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      if (res.status === 401) throw new Error('Echo360 says you are not signed in (401). Reload the page and try again.');
      return res;
    }
  }

  async function getJson(url) {
    const res = await get(url, 'application/json, text/plain, */*');
    if (!res.ok) return null;
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      return null; // e.g. the web-app HTML shell
    }
  }

  async function getText(url) {
    const res = await get(url, 'text/vtt, text/plain, */*');
    return res.ok ? res.text() : null;
  }

  // ------------------------------------------------------------- lessons --

  function lessonsFromDom() {
    const rows = document.querySelectorAll('[data-test-lessonid], [data-lesson-id], [data-lessonid]');
    const lessons = [];
    rows.forEach((row) => {
      const id =
        row.getAttribute('data-test-lessonid') || row.getAttribute('data-lesson-id') || row.getAttribute('data-lessonid');
      if (!id || lessons.some((l) => l.id === id)) return;
      if (/\b(live|future)\b/.test(row.className)) return;
      const nameEl = row.querySelector('.header, .title, [class*="title"], [class*="name"], h2, h3, h4');
      const name = ((nameEl || row).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 150);
      const dateEl = row.querySelector('.date, [class*="date"], time');
      const date = T.dateFromLessonId(id) || (dateEl && (dateEl.getAttribute('datetime') || dateEl.textContent.trim())) || '';
      lessons.push({ id, name: name || 'Untitled recording', date, mediaIds: [], hasVideo: true });
    });
    return lessons;
  }

  async function listLessons(sectionId) {
    const json = await getJson(`/section/${sectionId}/syllabus`).catch((e) => {
      if (/401/.test(e.message)) throw e;
      return null;
    });
    if (json) {
      const lessons = T.extractLessons(json);
      if (lessons.length) return { lessons, course: T.courseNameFromSyllabus(json), source: 'syllabus' };
    }
    // Newer Echo360 builds may not return JSON there — read the rendered list instead.
    for (let i = 0; i < 20; i++) {
      const lessons = lessonsFromDom();
      if (lessons.length) return { lessons, course: '', source: 'page' };
      if (!SECTION_RE.test(location.pathname)) break;
      await sleep(500);
    }
    return { lessons: [], course: '', source: 'none' };
  }

  async function mediaIdsForLesson(lesson) {
    if (lesson.mediaIds && lesson.mediaIds.length) return lesson.mediaIds;
    const id = encodeURI(lesson.id);
    // Lesson JSON (if this Echo360 build exposes it), then the lesson page HTML.
    for (const url of [`/api/ui/echoplayer/lessons/${id}`, `/lesson/${id}/classroom`]) {
      try {
        const res = await get(url, 'application/json, text/html, */*');
        if (!res.ok) continue;
        const text = await res.text();
        let ids = [];
        try {
          ids = T.collectMediaIds(JSON.parse(text));
        } catch (_) {
          ids = T.mediaIdsFromHtml(text);
        }
        if (ids.length) return ids;
      } catch (e) {
        if (/401/.test(e.message)) throw e;
      }
    }
    return [];
  }

  async function transcriptFor(lesson) {
    const mediaIds = await mediaIdsForLesson(lesson);
    if (!mediaIds.length) return { cues: null, reason: lesson.hasVideo ? 'no media found' : 'no recording' };
    const lid = encodeURI(lesson.id);
    for (const mid of mediaIds) {
      const base = `/api/ui/echoplayer/lessons/${lid}/medias/${mid}`;
      const json = await getJson(`${base}/transcript`);
      if (json) {
        const cues = T.cuesFromJson(json);
        if (cues.length) return { cues };
      }
      const vtt = await getText(`${base}/transcript-file?format=vtt`);
      if (vtt && vtt.includes('-->')) {
        const cues = T.parseVtt(vtt);
        if (cues.length) return { cues };
      }
    }
    return { cues: null, reason: 'no transcript' };
  }

  // ----------------------------------------------------------------- job --

  function report() {
    job.updatedAt = Date.now();
    try {
      chrome.runtime.sendMessage({ type: 'echoTx:progress', state: job }).catch(() => {});
    } catch (_) {
      /* extension reloaded */
    }
  }

  async function pool(items, n, fn) {
    let next = 0;
    const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    });
    await Promise.all(workers);
  }

  const sortKey = (l) => {
    const t = Date.parse(l.date) || Date.parse(T.dateLabel(l.date));
    return Number.isNaN(t) ? Infinity : t;
  };

  async function runJob(options) {
    job = {
      phase: 'listing',
      message: 'Finding recordings…',
      course: courseTitleFromDom(),
      total: 0,
      processed: 0,
      found: 0,
      missing: [],
      failed: [],
      startedAt: Date.now(),
    };
    report();
    try {
      const sectionId = findSectionId();
      if (!sectionId) throw new Error('Open the course’s list of recordings in Echo360 first.');

      const { lessons, course } = await listLessons(sectionId);
      if (course) job.course = course;
      if (!job.course) job.course = 'Echo360 course';
      if (!lessons.length) throw new Error('No recordings were found in this course.');

      lessons.sort((a, b) => sortKey(a) - sortKey(b));
      job.total = lessons.length;
      job.phase = 'fetching';
      job.message = `Downloading transcripts…`;
      report();

      const results = new Array(lessons.length);
      const label = (l) => `${T.dateLabel(l.date) ? T.dateLabel(l.date) + ' - ' : ''}${l.name}`;
      await pool(lessons, CONCURRENCY, async (lesson, i) => {
        try {
          const { cues, reason } = await transcriptFor(lesson);
          if (cues) {
            results[i] = { lesson, cues };
            job.found++;
          } else {
            job.missing.push(`${label(lesson)} (${reason})`);
          }
        } catch (e) {
          job.failed.push(`${label(lesson)}: ${e.message}`);
          if (/401/.test(e.message)) job.authError = e.message;
        }
        job.processed++;
        report();
      });

      if (!job.found) {
        throw new Error(
          job.authError ||
            `None of the ${lessons.length} recordings had a transcript available to download.`
        );
      }

      job.phase = 'zipping';
      job.message = 'Building ZIP…';
      report();

      const ordered = results.filter(Boolean);
      const files = T.buildFiles(ordered, options, {
        course: job.course,
        source: location.href,
        total: lessons.length,
        missing: job.missing,
        failed: job.failed,
      });
      const zipName = `${T.sanitizeFilename(job.course, 80)} - Echo360 transcripts.zip`;
      const res = await chrome.runtime.sendMessage({ type: 'echoTx:saveZip', zipName, files });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Could not save the ZIP file.');

      job.phase = 'done';
      job.message = `Saved ${job.found} transcript${job.found === 1 ? '' : 's'} to ${res.filename || zipName}`;
    } catch (e) {
      job.phase = 'error';
      job.message = e.message || String(e);
    }
    job.finishedAt = Date.now();
    report();
    const finished = job;
    job = null;
    return finished;
  }

  // ------------------------------------------------------------- messages --

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return false;
    if (msg.type === 'echoTx:probe') {
      // Course frames answer right away; other Echo360 frames answer a bit
      // later, so the popup can still say "go to the course page".
      const p = probe();
      if (p.sectionId) {
        sendResponse(p);
        return false;
      }
      setTimeout(() => sendResponse(p), 400);
      return true;
    }
    if (msg.type === 'echoTx:start') {
      if (msg.sectionId && msg.sectionId !== findSectionId()) return false;
      if (job) {
        sendResponse({ ok: false, error: 'A download is already running.' });
        return false;
      }
      runJob(msg.options || {});
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  globalThis.EchoTxContent = { probe, runJob };
})();
