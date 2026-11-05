/*
 * Pure helpers shared by the content script (and the Node tests):
 *  - reading Echo360's lesson list (syllabus JSON or page HTML)
 *  - turning Echo360 transcript JSON / WebVTT into a common cue list
 *  - rendering cues as .txt / .vtt / .srt
 *
 * Echo360 does not publish this API, so every parser here is deliberately
 * tolerant: it looks for the data by shape rather than by one exact path.
 */
(function (root) {
  'use strict';

  const UUID_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const UUID_EXACT = new RegExp('^' + UUID_SRC + '$', 'i');
  const isUuid = (s) => typeof s === 'string' && UUID_EXACT.test(s);

  // ---------------------------------------------------------------- time --

  /** "01:02:03.456", "02:03.4", "00:00:01,000" -> milliseconds (NaN if bad). */
  function parseTimestamp(ts) {
    const m = String(ts)
      .trim()
      .replace(',', '.')
      .match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
    if (!m) return NaN;
    const h = Number(m[1] || 0);
    const min = Number(m[2]);
    const s = Number(m[3]);
    const ms = Number((m[4] || '0').padEnd(3, '0'));
    return ((h * 60 + min) * 60 + s) * 1000 + ms;
  }

  /** milliseconds -> "hh:mm:ss.mmm" (sep "," for SRT). */
  function formatTimestamp(ms, sep = '.') {
    ms = Math.max(0, Math.round(ms || 0));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
  }

  /** milliseconds -> "h:mm:ss" / "mm:ss" for human-readable text. */
  function formatClock(ms) {
    const total = Math.max(0, Math.floor((ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }

  // ---------------------------------------------------------------- text --

  function decodeEntities(s) {
    return s
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&amp;/g, '&');
  }

  function cleanText(s) {
    return decodeEntities(String(s).replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ------------------------------------------------------------- parsing --

  /** Parse a WebVTT (or SRT) document into cues. */
  function parseVtt(text) {
    const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const cues = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.includes('-->')) {
        i++;
        continue;
      }
      const [a, b = ''] = line.split('-->');
      const start = parseTimestamp(a);
      const end = parseTimestamp(b.trim().split(/\s+/)[0]);
      i++;
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '') buf.push(lines[i++]);
      const raw = buf.join(' ');
      let speaker = '';
      const v = raw.match(/<v(?:\.[^\s>]*)?\s+([^>]+)>/);
      if (v) speaker = v[1].trim();
      const t = cleanText(raw);
      if (t && !Number.isNaN(start)) {
        cues.push({ start, end: Number.isNaN(end) ? start : end, text: t, speaker });
      }
    }
    return cues;
  }

  const TEXT_KEYS = ['content', 'text', 'transcript', 'caption', 'value', 'words', 'body'];
  const START_KEYS = ['startMs', 'startTimeMs', 'start_ms', 'start', 'startTime', 'begin', 'offset', 'from'];
  const END_KEYS = ['endMs', 'endTimeMs', 'end_ms', 'end', 'endTime', 'to'];
  const SPEAKER_KEYS = ['speaker', 'speakerName', 'speakerLabel', 'speaker_label'];

  const firstKey = (o, keys) => keys.find((k) => o[k] !== undefined && o[k] !== null);

  function textOf(v) {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(textOf).join(' ');
    if (v && typeof v === 'object') {
      const k = firstKey(v, TEXT_KEYS.concat(['word']));
      return k ? textOf(v[k]) : '';
    }
    return '';
  }

  function looksLikeCueArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    const sample = arr.slice(0, 5);
    return sample.every(
      (o) => o && typeof o === 'object' && !Array.isArray(o) && firstKey(o, TEXT_KEYS) && firstKey(o, START_KEYS)
    );
  }

  /**
   * Find the transcript cues anywhere inside an Echo360 JSON response
   * (normally data.contentJSON.cues[] with startMs/endMs/content), or an
   * embedded WebVTT string. Returns [] when nothing usable is present.
   */
  function cuesFromJson(json) {
    let best = null;
    let vttString = null;
    const seen = new Set();
    const walk = (o, depth) => {
      if (depth > 12 || o === null || o === undefined) return;
      if (typeof o === 'string') {
        if (!vttString && o.includes('-->') && /WEBVTT|\d\d:\d\d/.test(o)) vttString = o;
        else if (/^\s*[{[]/.test(o) && o.length > 20) {
          try {
            walk(JSON.parse(o), depth + 1); // contentJSON is sometimes a JSON string
          } catch (_) {
            /* not JSON */
          }
        }
        return;
      }
      if (typeof o !== 'object' || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) {
        if (looksLikeCueArray(o) && (!best || o.length > best.length)) best = o;
        o.forEach((x) => walk(x, depth + 1));
        return;
      }
      Object.values(o).forEach((v) => walk(v, depth + 1));
    };
    walk(json, 0);

    if (!best) return vttString ? parseVtt(vttString) : [];

    const sk = firstKey(best[0], START_KEYS);
    const ek = firstKey(best[0], END_KEYS);
    const toMs = (v, key) => {
      if (typeof v === 'string') {
        if (/^\d+(\.\d+)?$/.test(v)) v = Number(v);
        else return parseTimestamp(v);
      }
      return /ms/i.test(key) ? v : v * scale;
    };
    // Unit guess for keys without "Ms": integers past 10h worth of seconds => already ms.
    let scale = 1000;
    if (sk && !/ms/i.test(sk)) {
      const nums = best.map((c) => Number(c[sk])).filter((n) => !Number.isNaN(n));
      const allInts = nums.every((n) => Number.isInteger(n));
      if (allInts && Math.max(...nums) > 36000) scale = 1;
    }

    const cues = [];
    for (const c of best) {
      const text = cleanText(textOf(c[firstKey(c, TEXT_KEYS)]));
      if (!text) continue;
      const start = toMs(c[sk], sk);
      const end = ek && c[ek] !== undefined ? toMs(c[ek], ek) : start;
      const spk = firstKey(c, SPEAKER_KEYS);
      cues.push({
        start: Number.isNaN(start) ? 0 : start,
        end: Number.isNaN(end) ? start : end,
        text,
        speaker: spk ? cleanText(textOf(c[spk])) : '',
      });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  // ------------------------------------------------------------- lessons --

  /** Lesson ids often embed the scheduled time: G_<uuid>_<uuid>_2026-08-25T10:00:00.000_... */
  function dateFromLessonId(id) {
    const m = String(id || '').match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/);
    return m ? m[1] : '';
  }

  /** Any date-ish string -> "YYYY-MM-DD" in the viewer's local time ("" if unknown). */
  function dateLabel(d) {
    if (!d) return '';
    const s = String(d);
    // Zone-less timestamps (e.g. from lesson ids) are already local.
    const local = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+)?$/);
    if (local) return local[1];
    const t = new Date(s);
    if (Number.isNaN(t.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  }

  /** Media ids for a lesson object from the syllabus, by shape. */
  function collectMediaIds(obj) {
    const ids = [];
    const add = (id) => {
      if (isUuid(id) && !ids.includes(id)) ids.push(id);
    };
    const seen = new Set();
    const walk = (o, key, depth) => {
      if (!o || typeof o !== 'object' || depth > 10 || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) {
        if (/^medias?$|^mediaList$/i.test(key)) o.forEach((m) => m && add(m.id || m.mediaId));
        o.forEach((x) => walk(x, key, depth + 1));
        return;
      }
      for (const [k, v] of Object.entries(o)) {
        if (/^media_?id$/i.test(k)) add(v);
        if (k === 'media' && v && typeof v === 'object' && !Array.isArray(v)) {
          // video.media.media.id is the real media; video.media.id may be too.
          if (v.media && typeof v.media === 'object') add(v.media.id);
          add(v.id);
        }
        walk(v, k, depth + 1);
      }
    };
    walk(obj, '', 0);
    return ids;
  }

  /** Lessons from GET /section/{id}/syllabus. */
  function extractLessons(json) {
    const data = Array.isArray(json && json.data) ? json.data : Array.isArray(json) ? json : null;
    if (!data) return [];
    const out = [];
    const visit = (item, group) => {
      if (!item || typeof item !== 'object') return;
      if (Array.isArray(item.lessons)) {
        const g = (item.groupInfo && item.groupInfo.name) || group;
        item.lessons.forEach((x) => visit(x, g));
        return;
      }
      const wrap = item.lesson && typeof item.lesson === 'object' ? item.lesson : item;
      const inner = wrap.lesson && typeof wrap.lesson === 'object' ? wrap.lesson : wrap;
      const id = inner.id || wrap.id;
      if (!id || typeof id !== 'string') return;
      let name = String(inner.name || inner.displayName || wrap.name || '').trim() || 'Untitled recording';
      if (group && group !== name) name = `${group} - ${name}`;
      const timing = inner.timing || wrap.timing || {};
      const date =
        wrap.startTimeUTC || timing.start || wrap.captureStartedAt || dateFromLessonId(id) || inner.createdAt || '';
      out.push({
        id,
        name,
        date,
        mediaIds: collectMediaIds(wrap),
        hasVideo: wrap.hasVideo !== false || wrap.hasAvailableVideo === true,
      });
    };
    data.forEach((x) => visit(x, ''));
    const unique = new Map();
    out.forEach((l) => unique.has(l.id) || unique.set(l.id, l));
    return [...unique.values()];
  }

  /** First non-empty string found under one of `keys`, anywhere in obj. */
  function findString(obj, keys) {
    let found = '';
    const seen = new Set();
    const walk = (o, depth) => {
      if (found || !o || typeof o !== 'object' || depth > 10 || seen.has(o)) return;
      seen.add(o);
      for (const k of keys) {
        if (!Array.isArray(o) && typeof o[k] === 'string' && o[k].trim()) {
          found = o[k].trim();
          return;
        }
      }
      Object.values(o).forEach((v) => walk(v, depth + 1));
    };
    walk(obj, 0);
    return found;
  }

  function courseNameFromSyllabus(json) {
    const name = findString(json, ['courseName', 'sectionName', 'courseCode']);
    const number = findString(json, ['sectionNumber']);
    return name && number && !name.includes(number) ? `${name} ${number}` : name;
  }

  /** Media ids mentioned in a lesson page's HTML (embedded app state or URLs). */
  function mediaIdsFromHtml(html) {
    const s = String(html)
      .replace(/\\u0022/gi, '"')
      .replace(/\\"/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/\\\//g, '/');
    const ids = [];
    const add = (id) => id && !ids.includes(id.toLowerCase()) && ids.push(id.toLowerCase());
    const patterns = [
      new RegExp('/medias/(' + UUID_SRC + ')', 'gi'),
      new RegExp('"media_?id"\\s*:\\s*"(' + UUID_SRC + ')"', 'gi'),
    ];
    for (const re of patterns) for (const m of s.matchAll(re)) add(m[1]);
    for (const m of s.matchAll(/"medias"\s*:\s*\[/gi)) {
      const window = s.slice(m.index, m.index + 4000);
      for (const mm of window.matchAll(new RegExp('"id"\\s*:\\s*"(' + UUID_SRC + ')"', 'gi'))) add(mm[1]);
    }
    return ids;
  }

  // ----------------------------------------------------------- rendering --

  /** Plain readable text: paragraphs break on speaker changes or long pauses. */
  function toPlainText(cues, { speakers = true } = {}) {
    const paras = [];
    let cur = null;
    for (const c of cues) {
      const newSpeaker = speakers && c.speaker && (!cur || cur.speaker !== c.speaker);
      const pause = cur && c.start - cur.end > 4000;
      const long = cur && cur.words > 120 && /[.?!]$/.test(cur.parts[cur.parts.length - 1]);
      if (!cur || newSpeaker || pause || long) {
        cur = { speaker: c.speaker || (cur && cur.speaker) || '', parts: [], words: 0, end: c.end, label: newSpeaker };
        paras.push(cur);
      }
      cur.parts.push(c.text);
      cur.words += c.text.split(' ').length;
      cur.end = c.end;
    }
    return paras
      .map((p) => (p.label && speakers ? `${p.speaker}: ` : '') + p.parts.join(' '))
      .join('\n\n');
  }

  function toTimestampedText(cues, { speakers = true } = {}) {
    return cues
      .map((c) => `[${formatClock(c.start)}] ${speakers && c.speaker ? c.speaker + ': ' : ''}${c.text}`)
      .join('\n');
  }

  function toVtt(cues, { speakers = true } = {}) {
    const body = cues
      .map((c, i) => {
        const v = speakers && c.speaker ? `<v ${c.speaker.replace(/>/g, '')}>` : '';
        return `${i + 1}\n${formatTimestamp(c.start)} --> ${formatTimestamp(Math.max(c.end, c.start))}\n${v}${c.text}`;
      })
      .join('\n\n');
    return `WEBVTT\n\n${body}\n`;
  }

  function toSrt(cues, { speakers = true } = {}) {
    return (
      cues
        .map(
          (c, i) =>
            `${i + 1}\n${formatTimestamp(c.start, ',')} --> ${formatTimestamp(Math.max(c.end, c.start), ',')}\n` +
            `${speakers && c.speaker ? c.speaker + ': ' : ''}${c.text}`
        )
        .join('\n\n') + '\n'
    );
  }

  const FORMATS = {
    txt: { label: 'Text', folder: 'Text', ext: '.txt', render: toPlainText, header: true },
    timestamps: { label: 'Text with timestamps', folder: 'Text with timestamps', ext: '.txt', render: toTimestampedText, header: true },
    vtt: { label: 'WebVTT captions', folder: 'VTT', ext: '.vtt', render: toVtt },
    srt: { label: 'SRT captions', folder: 'SRT', ext: '.srt', render: toSrt },
  };

  function sanitizeFilename(name, max = 120) {
    let s = String(name || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.\s]+|[.\s]+$/g, '');
    if (s.length > max) s = s.slice(0, max).trim();
    return s || 'untitled';
  }

  /**
   * Build the list of files that go in the ZIP.
   * results: [{ lesson, cues }]   (already in display order)
   */
  function buildFiles(results, { formats = ['txt'], combined = false, speakers = true } = {}, meta = {}) {
    const course = sanitizeFilename(meta.course || 'Echo360 course', 80);
    const fmts = formats.filter((f) => FORMATS[f]);
    if (!fmts.length) fmts.push('txt');
    const nested = fmts.length > 1;
    const files = [];
    const used = new Set();

    results.forEach(({ lesson, cues }, idx) => {
      const date = dateLabel(lesson.date);
      const num = String(idx + 1).padStart(2, '0');
      let base = sanitizeFilename(`${num} - ${date ? date + ' - ' : ''}${lesson.name}`);
      for (const f of fmts) {
        const F = FORMATS[f];
        const dir = nested ? `${course}/${F.folder}/` : `${course}/`;
        let path = `${dir}${base}${F.ext}`;
        for (let n = 2; used.has(path.toLowerCase()); n++) path = `${dir}${base} (${n})${F.ext}`;
        used.add(path.toLowerCase());
        let text = F.render(cues, { speakers });
        if (F.header) text = `${lesson.name}\n${date ? date + '\n' : ''}\n${text}\n`;
        files.push({ name: path, text });
      }
    });

    if (combined && results.length) {
      const parts = results.map(({ lesson, cues }) => {
        const date = dateLabel(lesson.date);
        const title = `${lesson.name}${date ? ' (' + date + ')' : ''}`;
        return `${'='.repeat(Math.min(78, title.length))}\n${title}\n${'='.repeat(Math.min(78, title.length))}\n\n${toPlainText(cues, { speakers })}\n`;
      });
      files.push({ name: `${course}/All transcripts.txt`, text: `${meta.course || course}\n\n${parts.join('\n\n')}` });
    }

    const lines = [
      `Echo360 transcripts - ${meta.course || course}`,
      `Downloaded: ${new Date().toLocaleString()}`,
      meta.source ? `From: ${meta.source}` : '',
      '',
      `Recordings in course: ${meta.total ?? results.length}`,
      `Transcripts saved:    ${results.length}`,
    ];
    if (meta.missing && meta.missing.length) {
      lines.push('', `No transcript available (${meta.missing.length}):`, ...meta.missing.map((m) => `  - ${m}`));
    }
    if (meta.failed && meta.failed.length) {
      lines.push('', `Errors (${meta.failed.length}):`, ...meta.failed.map((m) => `  - ${m}`));
    }
    files.push({ name: `${course}/_download report.txt`, text: lines.filter((l, i) => l !== '' || i > 2).join('\n') + '\n' });
    return files;
  }

  const api = {
    UUID_SRC,
    isUuid,
    parseTimestamp,
    formatTimestamp,
    formatClock,
    parseVtt,
    cuesFromJson,
    dateFromLessonId,
    dateLabel,
    collectMediaIds,
    extractLessons,
    courseNameFromSyllabus,
    mediaIdsFromHtml,
    toPlainText,
    toTimestampedText,
    toVtt,
    toSrt,
    FORMATS,
    sanitizeFilename,
    buildFiles,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EchoTx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
