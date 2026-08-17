// Netlify Function: one shared, grade-wide leaderboard.
// Uses Netlify Blobs — the same zero-config store already used by progress.js —
// to hold one JSON object mapping studentId -> stats. Every device that opts in
// pushes its own student's row after each session; anyone can read the sorted
// top of the list. No accounts, no per-class grouping — one board for everyone
// using this deployed URL.
//
// Each entry carries both an all-time total and a "this week" snapshot (computed
// client-side from that student's own session history, since the client is the
// source of truth for its own data). The server's job is just to store the
// latest snapshot per student and decide, using its own clock, which entries'
// "this week" numbers are actually still current — a stale snapshot from a
// student who hasn't opened the app this week simply drops out of the weekly
// view (it stays in the all-time view).
//
// GET  /.netlify/functions/leaderboard?studentId=stu_ABC123
//      -> { top: [...], weekTop: [...], mostImproved: {...}|null, you: {...}|null, totalStudents }
// POST /.netlify/functions/leaderboard
//      -> body: one student's stats (see fields below), upserts it

const { getStore } = require('@netlify/blobs');

const STUDENT_ID_RE = /^stu_[A-Z2-9]{8,16}$/;
const MAX_BODY_BYTES = 20000;
const MAX_STUDENTS = 2000; // safety ceiling so the blob can't grow unbounded
const TOP_N = 50;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'Anonymous';
  const stripped = raw.replace(/[<>]/g, '').trim().slice(0, 20);
  return stripped || 'Anonymous';
}

function sanitizeAvatar(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^\p{Emoji}‍️]/gu, '').slice(0, 8);
}

function clampNumber(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Monday (UTC) of the week containing the given YYYY-MM-DD date string.
function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function toRow(studentId, entry) {
  return {
    studentId,
    name: entry.name,
    avatar: entry.avatar || '',
    points: entry.points,
    bestStreak: entry.bestStreak,
    accuracy: entry.accuracy,
    sessionsCount: entry.sessionsCount,
  };
}
function toWeekRow(studentId, entry) {
  return {
    studentId,
    name: entry.name,
    avatar: entry.avatar || '',
    weeklyPoints: entry.weeklyPoints || 0,
    weeklyAccuracy: entry.weeklyAccuracy || 0,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const store = getStore({ name: 'mav-leaderboard', consistency: 'strong' });
  const KEY = 'all-students';
  const currentWeekStart = mondayOf(todayUTC());

  try {
    if (event.httpMethod === 'GET') {
      const requestedId = ((event.queryStringParameters && event.queryStringParameters.studentId) || '').trim();
      const data = (await store.get(KEY, { type: 'json' })) || {};
      const entries = Object.entries(data);

      const rows = entries.map(([id, entry]) => toRow(id, entry)).sort((a, b) => b.points - a.points);
      const top = rows.slice(0, TOP_N);

      const thisWeekEntries = entries.filter(([, e]) => e.weekStart === currentWeekStart);
      const weekTop = thisWeekEntries
        .map(([id, e]) => toWeekRow(id, e))
        .sort((a, b) => b.weeklyPoints - a.weeklyPoints)
        .slice(0, TOP_N);

      // Most Improved: biggest week-over-week accuracy gain, among students
      // who were active (had at least one session) in both this week and last.
      let mostImproved = null;
      let bestDelta = 0;
      for (const [id, e] of thisWeekEntries) {
        if (!e.weeklySessions || !e.prevWeekSessions) continue;
        const delta = (e.weeklyAccuracy || 0) - (e.prevWeekAccuracy || 0);
        if (delta > bestDelta) {
          bestDelta = delta;
          mostImproved = { studentId: id, name: e.name, avatar: e.avatar || '', delta, weeklyAccuracy: e.weeklyAccuracy };
        }
      }

      let you = null;
      if (STUDENT_ID_RE.test(requestedId) && data[requestedId]) {
        const rank = rows.findIndex((r) => r.studentId === requestedId) + 1;
        you = { ...toRow(requestedId, data[requestedId]), rank };
      }
      return json(200, { top, weekTop, mostImproved, you, totalStudents: rows.length });
    }

    if (event.httpMethod === 'POST') {
      if (event.body && event.body.length > MAX_BODY_BYTES) {
        return json(413, { error: 'Payload too large' });
      }
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch (e) {
        return json(400, { error: 'Body must be valid JSON' });
      }

      const studentId = (payload.studentId || '').trim();
      if (!STUDENT_ID_RE.test(studentId)) {
        return json(400, { error: 'Invalid or missing studentId' });
      }

      const weekStart = mondayOf((payload.weekStart || '').trim()) || currentWeekStart;

      const entry = {
        name: sanitizeName(payload.name),
        avatar: sanitizeAvatar(payload.avatar),
        points: clampNumber(payload.points, 0, 10000000),
        bestStreak: clampNumber(payload.bestStreak, 0, 100000),
        accuracy: clampNumber(payload.accuracy, 0, 100),
        sessionsCount: clampNumber(payload.sessionsCount, 0, 1000000),
        weekStart,
        weeklyPoints: clampNumber(payload.weeklyPoints, 0, 1000000),
        weeklyAccuracy: clampNumber(payload.weeklyAccuracy, 0, 100),
        weeklySessions: clampNumber(payload.weeklySessions, 0, 100000),
        prevWeekAccuracy: clampNumber(payload.prevWeekAccuracy, 0, 100),
        prevWeekSessions: clampNumber(payload.prevWeekSessions, 0, 100000),
        updatedAt: Date.now(),
      };

      const data = (await store.get(KEY, { type: 'json' })) || {};
      const isNewStudent = !data[studentId];
      if (isNewStudent && Object.keys(data).length >= MAX_STUDENTS) {
        return json(507, { error: 'Leaderboard is full' });
      }
      data[studentId] = entry;
      await store.setJSON(KEY, data);

      const rows = Object.entries(data)
        .map(([id, e]) => toRow(id, e))
        .sort((a, b) => b.points - a.points);
      const rank = rows.findIndex((r) => r.studentId === studentId) + 1;
      return json(200, { ok: true, rank, totalStudents: rows.length });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { error: 'Server error', detail: String((err && err.message) || err) });
  }
};
