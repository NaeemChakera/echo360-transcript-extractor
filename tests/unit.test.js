const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const T = require('../extension/lib/transcript.js');
const F = require('./fixtures.js');

test('extractLessons flattens groups and finds media ids', () => {
  const lessons = T.extractLessons(F.syllabus);
  assert.strictEqual(lessons.length, 6);
  const l1 = lessons.find((l) => l.id === F.L1);
  assert.strictEqual(l1.name, 'Lecture 1: Intro');
  assert.deepStrictEqual(l1.mediaIds, [F.M1]);
  assert.ok(lessons.some((l) => l.name === 'Week 2 - Part A'));
  assert.strictEqual(lessons.find((l) => l.id === F.L6).hasVideo, false);
  assert.strictEqual(T.courseNameFromSyllabus(F.syllabus), 'BIOL 101');
});

test('cuesFromJson reads Echo360 contentJSON cues', () => {
  const cues = T.cuesFromJson(F.transcripts[`${F.L1}|${F.M1}`]);
  assert.strictEqual(cues.length, 3);
  assert.deepStrictEqual(cues[0], { start: 0, end: 2500, text: 'Welcome to biology.', speaker: 'Dr. Smith' });
});

test('cuesFromJson handles second-based and stringified variants', () => {
  const cues = T.cuesFromJson({ data: { contentJSON: JSON.stringify({ cues: [{ start: 1.5, end: 2, text: 'hi' }] }) } });
  assert.deepStrictEqual(cues, [{ start: 1500, end: 2000, text: 'hi', speaker: '' }]);
  assert.strictEqual(T.cuesFromJson({ data: { vtt: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nyo\n' } })[0].text, 'yo');
  assert.deepStrictEqual(T.cuesFromJson({ status: 'ok', data: null }), []);
});

test('parseVtt reads voices and timestamps', () => {
  const cues = T.parseVtt(F.vttOnly[`${F.L2}|${F.M2}`]);
  assert.deepStrictEqual(cues[0], { start: 1000, end: 3000, text: 'Cells are small.', speaker: 'Prof' });
  assert.strictEqual(cues[1].start, 65500);
});

test('renderers', () => {
  const cues = T.cuesFromJson(F.transcripts[`${F.L1}|${F.M1}`]);
  assert.strictEqual(
    T.toPlainText(cues),
    'Dr. Smith: Welcome to biology. Today we cover the syllabus.\n\nAny questions?'
  );
  assert.match(T.toTimestampedText(cues), /^\[00:00\] Dr\. Smith: Welcome/);
  assert.match(T.toVtt(cues), /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:02\.500\n<v Dr\. Smith>Welcome/);
  assert.match(T.toSrt(cues), /00:00:12,000 --> 00:00:14,000\nDr\. Smith: Any questions\?/);
  // round trip
  assert.deepStrictEqual(T.parseVtt(T.toVtt(cues)), cues);
});

test('mediaIdsFromHtml finds ids in embedded state', () => {
  const html = `<script>Echo["classroomApp"]("{\\"lesson\\":{\\"medias\\":[{\\"id\\":\\"${F.M1}\\"}]}}")</script>`;
  assert.deepStrictEqual(T.mediaIdsFromHtml(html), [F.M1]);
});

test('buildFiles names and folders', () => {
  const lessons = T.extractLessons(F.syllabus);
  const cues = [{ start: 0, end: 1, text: 'x', speaker: '' }];
  const r = [{ lesson: lessons[1], cues }, { lesson: lessons[0], cues }];
  const flat = T.buildFiles(r, { formats: ['txt'] }, { course: 'BIOL 101: Intro/Bio' });
  assert.deepStrictEqual(flat.map((f) => f.name), [
    'BIOL 101- Intro-Bio/01 - 2026-08-25 - Lecture 1- Intro.txt',
    'BIOL 101- Intro-Bio/02 - 2026-08-27 - Lecture 2- Cells.txt',
    'BIOL 101- Intro-Bio/_download report.txt',
  ]);
  const nested = T.buildFiles(r, { formats: ['txt', 'srt'], combined: true }, { course: 'C' });
  assert.ok(nested.some((f) => f.name === 'C/SRT/01 - 2026-08-25 - Lecture 1- Intro.srt'));
  assert.ok(nested.some((f) => f.name === 'C/All transcripts.txt'));
});

test('zip builds an archive that unzip can read', async () => {
  const { buildZip } = await import('../extension/lib/zip.js');
  const files = [
    { name: 'Course/a.txt', text: 'hello '.repeat(100) },
    { name: 'Course/ünïcødé.txt', text: 'short' },
  ];
  const bytes = await buildZip(files);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
  const zp = path.join(dir, 't.zip');
  fs.writeFileSync(zp, bytes);
  const out = execFileSync('python3', ['-c', `import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print(json.dumps({n: z.read(n).decode() for n in z.namelist()}))`, zp]).toString();
  const got = JSON.parse(out);
  assert.strictEqual(got['Course/a.txt'], 'hello '.repeat(100));
  assert.strictEqual(got['Course/ünïcødé.txt'], 'short');
});
