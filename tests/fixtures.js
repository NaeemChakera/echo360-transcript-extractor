// Shared mock Echo360 data for unit + end-to-end tests.
const SECTION = '11111111-2222-3333-4444-555555555555';
const M1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const M2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const M4 = 'aaaaaaaa-0000-0000-0000-000000000004';
const M5 = 'aaaaaaaa-0000-0000-0000-000000000005';
const L1 = `G_${SECTION}_b1_2026-08-25T10:00:00.000_2026-08-25T10:50:00.000`;
const L2 = `G_${SECTION}_b2_2026-08-27T10:00:00.000_2026-08-27T10:50:00.000`;
const L3 = `G_${SECTION}_b3_2026-08-29T10:00:00.000_2026-08-29T10:50:00.000`;
const L4 = `G_${SECTION}_b4_2026-09-01T10:00:00.000_2026-09-01T10:50:00.000`;
const L5 = `G_${SECTION}_b5_2026-09-01T11:00:00.000_2026-09-01T11:50:00.000`;
const L6 = `G_${SECTION}_b6_2026-12-01T10:00:00.000_2026-12-01T10:50:00.000`;

const lessonItem = (id, name, mediaId, start) => ({
  type: 'SyllabusLessonType',
  lesson: {
    lesson: { id, name, createdAt: start },
    startTimeUTC: start,
    hasVideo: !!mediaId,
    hasAvailableVideo: !!mediaId,
    video: mediaId ? { published: { courseName: 'BIOL 101' }, media: { media: { id: mediaId } } } : null,
    medias: mediaId ? [{ id: mediaId, mediaType: 'Video' }] : [],
  },
});

const syllabus = {
  status: 'ok',
  data: [
    lessonItem(L2, 'Lecture 2: Cells', M2, '2026-08-27T16:00:00.000Z'),
    lessonItem(L1, 'Lecture 1: Intro', M1, '2026-08-25T16:00:00.000Z'),
    lessonItem(L3, 'Lecture 3: No captions', 'aaaaaaaa-0000-0000-0000-000000000003', '2026-08-29T16:00:00.000Z'),
    {
      type: 'SyllabusGroupType',
      groupInfo: { name: 'Week 2', createdAt: '2026-09-01T16:00:00.000Z' },
      lessons: [
        lessonItem(L4, 'Part A', M4, '2026-09-01T16:00:00.000Z'),
        lessonItem(L5, 'Part B', M5, '2026-09-01T17:00:00.000Z'),
      ],
    },
    lessonItem(L6, 'Future lecture', null, '2026-12-01T17:00:00.000Z'),
  ],
};

const jsonTranscript = (cues) => ({
  status: 'ok',
  data: { id: 'tx', contentJSON: { cues } },
});

const transcripts = {
  // JSON endpoint
  [`${L1}|${M1}`]: jsonTranscript([
    { startMs: 0, endMs: 2500, content: 'Welcome to biology.', speaker: 'Dr. Smith' },
    { startMs: 2500, endMs: 5000, content: 'Today we cover the syllabus.', speaker: 'Dr. Smith' },
    { startMs: 12000, endMs: 14000, content: 'Any questions?', speaker: 'Dr. Smith' },
  ]),
  [`${L4}|${M4}`]: jsonTranscript([{ startMs: 1000, endMs: 3000, content: 'Part A content &amp; more.' }]),
  [`${L5}|${M5}`]: jsonTranscript([{ startMs: 1000, endMs: 3000, content: 'Part B content.' }]),
};
// VTT-only endpoint
const vttOnly = {
  [`${L2}|${M2}`]: 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Prof>Cells are small.\n\n2\n00:01:05.500 --> 00:01:08.000\nVery small.\n',
};

module.exports = { SECTION, L1, L2, L3, L4, L5, L6, M1, M2, M4, M5, syllabus, transcripts, vttOnly };
