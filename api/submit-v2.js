export const config = { runtime: 'edge' };
const VALID_DIFFS = ['easy', 'normal', 'hard', 'human_calculator'];
const VALID_OPS = ['multiplication', 'addition', 'subtraction', 'division', 'mixed'];
const SCORING = {
  easy: { multiplier: 1.0, divisor: 1_600_000, penaltyPer: 200 },
  normal: { multiplier: 2.5, divisor: 800_000, penaltyPer: 200 },
  hard: { multiplier: 5.0, divisor: 400_000, penaltyPer: 200 },
  human_calculator: { multiplier: 10.0, divisor: 200_000, penaltyPer: 200 },
};
const CORS = {
  'Access-Control-Allow-Origin': 'https://40smathchallenge.vercel.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
function responseJson(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
function clientIp(req) {
  return req.headers.get('x-real-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '127.0.0.1';
}
async function hashIp(ip) {
  const data = new TextEncoder().encode(`ip:${ip}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
async function verifySessionToken(token, secret, ip) {
  if (typeof token !== 'string' || !token) return { ok: false, reason: 'No token' };
  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'Malformed token' };
  const [timestamp, nonce, fingerprint, receivedSig] = parts;
  if (!/^\d+$/.test(timestamp) || !/^[0-9a-f]{16}$/.test(fingerprint) || !/^[0-9a-f]{32}$/.test(nonce)) {
    return { ok: false, reason: 'Malformed token' };
  }
  const expectedFingerprint = await hashIp(ip);
  if (fingerprint !== expectedFingerprint) return { ok: false, reason: 'IP mismatch' };
  const payload = `${timestamp}.${nonce}.${fingerprint}`;
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(payload));
  const expectedSig = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (receivedSig.length !== expectedSig.length) return { ok: false, reason: 'Signature mismatch' };
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) diff |= receivedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: 'Signature invalid' };
  const ageSeconds = (Date.now() - Number(timestamp)) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return { ok: false, reason: 'Invalid timestamp' };
  return { ok: true, ageSeconds, nonce };
}
function redisEnv() {
  return {
    url: (typeof process !== 'undefined' && process.env?.UPSTASH_REDIS_REST_URL) || globalThis.__env__?.UPSTASH_REDIS_REST_URL,
    token: (typeof process !== 'undefined' && process.env?.UPSTASH_REDIS_REST_TOKEN) || globalThis.__env__?.UPSTASH_REDIS_REST_TOKEN,
  };
}
async function consumeTokenOnce(nonce, ageSeconds) {
  const { url, token } = redisEnv();
  if (!url || !token) return { ok: false, reason: 'Redis unavailable' };
  const ttl = Math.max(60, Math.ceil(180 - ageSeconds));
  try {
    const res = await fetch(`${url}/set/used_token:${nonce}/1/ex/${ttl}/nx`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, reason: `Redis status ${res.status}` };
    const data = await res.json();
    return data.result === null ? { ok: false, reason: 'Token replayed' } : { ok: true };
  } catch (err) {
    console.error('[REDIS REPLAY ERROR]', err);
    return { ok: false, reason: 'Redis request failed' };
  }
}
async function isOnCooldown(ip) {
  const { url, token } = redisEnv();
  if (!url || !token) return { ok: false, error: 'Redis unavailable' };
  try {
    const res = await fetch(`${url}/get/submit_cooldown:${encodeURIComponent(ip)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, error: `Redis status ${res.status}` };
    const data = await res.json();
    return { ok: true, onCooldown: data.result !== null };
  } catch (err) {
    console.error('[REDIS COOLDOWN ERROR]', err);
    return { ok: false, error: 'Redis request failed' };
  }
}
async function setCooldown(ip, seconds = 1800) {
  const { url, token } = redisEnv();
  if (!url || !token) return false;
  try {
    const res = await fetch(`${url}/set/submit_cooldown:${encodeURIComponent(ip)}/1/ex/${seconds}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) console.error(`[REDIS COOLDOWN SET] status=${res.status}`);
    return res.ok;
  } catch (err) {
    console.error('[REDIS COOLDOWN SET ERROR]', err);
    return false;
  }
}
function detectOp(q) {
  if (/[×x]/.test(q)) return 'multiplication';
  if (/\+/.test(q)) return 'addition';
  if (/[−-]/.test(q)) return 'subtraction';
  if (/[÷/]/.test(q)) return 'division';
  return null;
}
function validateMultiplicationRange(a, b, difficulty) {
  switch (difficulty) {
    case 'easy': {
      const ok = ((a >= 2 && a <= 5) && (b >= 2 && b <= 9)) || ((b >= 2 && b <= 5) && (a >= 2 && a <= 9));
      if (!ok) return 'Easy operand out of range';
      if (a * b >= 50) return 'Easy product too large';
      return null;
    }
    case 'normal': return (a >= 2 && a <= 9 && b >= 2 && b <= 9) ? null : 'Normal operand out of range';
    case 'hard':
      if (a < 6 || a > 12 || b < 6 || b > 12) return 'Hard operand out of range';
      if (a === 10 || b === 10) return 'Hard cannot use x10';
      return null;
    case 'human_calculator': {
      const ok = ((a >= 13 && a <= 19) && (b >= 7 && b <= 12)) || ((b >= 13 && b <= 19) && (a >= 7 && a <= 12));
      if (!ok) return 'HC operand out of range';
      if (a * b > 230) return 'HC product too large';
      if (a === 10 || b === 10) return 'HC cannot use x10';
      return null;
    }
    default: return 'Unknown difficulty';
  }
}
function validateRange(op, a, b, difficulty) {
  switch (op) {
    case 'multiplication': return validateMultiplicationRange(a, b, difficulty);
    case 'addition':
      if (difficulty === 'easy') return (a >= 2 && a <= 20 && b >= 2 && b <= 20 && a + b <= 40) ? null : 'Easy addition out of range';
      if (difficulty === 'normal') return (a >= 11 && a <= 99 && b >= 11 && b <= 99) ? null : 'Normal addition out of range';
      if (difficulty === 'hard') return (a >= 101 && a <= 499 && b >= 101 && b <= 499) ? null : 'Hard addition out of range';
      if (difficulty === 'human_calculator') return (a >= 500 && a <= 999 && b >= 500 && b <= 999) ? null : 'HC addition out of range';
      return 'Unknown difficulty';
    case 'subtraction':
      if (difficulty === 'easy') return (a >= 10 && a <= 99 && b >= 1 && b <= 9) ? null : 'Easy subtraction out of range';
      if (difficulty === 'normal') return (a >= 21 && a <= 99 && b >= 11 && b <= 99) ? null : 'Normal subtraction out of range';
      if (difficulty === 'hard') return (a >= 201 && a <= 999 && b >= 101 && b <= 500) ? null : 'Hard subtraction out of range';
      if (difficulty === 'human_calculator') return (a >= 1001 && a <= 9999 && b >= 501 && b <= 999) ? null : 'HC subtraction out of range';
      return 'Unknown difficulty';
    case 'division': {
      if (b === 0) return 'Divide by zero';
      const quotient = a / b;
      if (!Number.isInteger(quotient)) return 'Non-integer division';
      if (difficulty === 'easy') return (b >= 2 && b <= 5 && quotient >= 2 && quotient <= 9) ? null : 'Easy division out of range';
      if (difficulty === 'normal') return (b >= 2 && b <= 9 && quotient >= 2 && quotient <= 9) ? null : 'Normal division out of range';
      if (difficulty === 'hard') return (b >= 3 && b <= 12 && quotient >= 3 && quotient <= 12) ? null : 'Hard division out of range';
      if (difficulty === 'human_calculator') return (a <= 225 && b >= 7 && b <= 15 && quotient >= 7 && quotient <= 15) ? null : 'HC division out of range';
      return 'Unknown difficulty';
    }
    default: return 'Unknown operation';
  }
}
function parseQuestion(q, operation, difficulty) {
  if (typeof q !== 'string' || q.length > 40) return { ok: false, error: 'Malformed question' };
  const detected = detectOp(q);
  if (!detected || (operation !== 'mixed' && detected !== operation)) return { ok: false, error: 'Operator mismatch' };
  const re = {
    multiplication: /^(\d+)\s*[×x]\s*(\d+)$/,
    addition: /^(\d+)\s*\+\s*(\d+)$/,
    subtraction: /^(\d+)\s*[−-]\s*(\d+)$/,
    division: /^(\d+)\s*[÷/]\s*(\d+)$/,
  }[detected];
  const m = q.match(re);
  if (!m) return { ok: false, error: 'Malformed question' };
  const a = Number(m[1]);
  const b = Number(m[2]);
  const err = validateRange(detected, a, b, difficulty);
  if (err) return { ok: false, error: err };
  let correctAns;
  let pairKey;
  if (detected === 'multiplication') {
    correctAns = a * b;
    pairKey = [Math.min(a, b), Math.max(a, b)].join('x');
  } else if (detected === 'addition') {
    correctAns = a + b;
    pairKey = [Math.min(a, b), Math.max(a, b)].join('+');
  } else if (detected === 'subtraction') {
    correctAns = a - b;
    pairKey = `${a}-${b}`;
  } else {
    correctAns = a / b;
    pairKey = `${a}/${b}`;
  }
  return { ok: true, correctAns, pairKey };
}
function normalizeAnswer(value) {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : 'invalid';
  if (typeof value === 'string' && /^\d{1,6}$/.test(value)) return Number(value);
  return 'invalid';
}
function validateAnswerTiming(answerTimestamps, difficulty) {
  if (!Array.isArray(answerTimestamps) || answerTimestamps.length < 6) return null;
  const diffs = [];
  for (let i = 1; i < answerTimestamps.length; i++) {
    const a = Number(answerTimestamps[i - 1]);
    const b = Number(answerTimestamps[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 'Timing data invalid';
    diffs.push(b - a);
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  if (!(mean > 0)) return 'Timing data invalid';
  const variance = diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / diffs.length;
  const cv = Math.sqrt(variance) / mean;
  const minCV = difficulty === 'human_calculator' ? 0.15 : difficulty === 'hard' ? 0.20 : 0.25;
  return (cv < minCV && mean < 2000 && diffs.length >= 5) ? 'Pola jawaban kamu terlalu seragam. Skor ditolak.' : null;
}
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (req.method !== 'POST') return responseJson(405, { error: 'Method not allowed' });
  const ip = clientIp(req);
  let body;
  try { body = await req.json(); } catch { return responseJson(400, { error: 'Invalid JSON' }); }
  const { username, difficulty, operation, duration, questions, userAnswers, timeRemaining, sessionToken, answerTimestamps } = body || {};
  const secret = (typeof process !== 'undefined' && process.env?.SESSION_SECRET) || globalThis.__env__?.SESSION_SECRET;
  if (!secret) return responseJson(500, { error: 'Server config error' });
  const verified = await verifySessionToken(sessionToken, secret, ip);
  if (!verified.ok) return responseJson(403, { error: 'Session token tidak valid. Mulai quiz dari awal.' });
  if (verified.ageSeconds > 180) return responseJson(400, { error: 'Session sudah kadaluarsa. Refresh halaman dan coba lagi.' });
  if (verified.ageSeconds < 8) return responseJson(403, { error: 'Waduuuh, kok cepet banget? Kamu manusia atau kalkulator? Skor ditolak ya!' });
  if (typeof username !== 'string' || !/^[a-z0-9_]{2,20}$/.test(username)) return responseJson(400, { error: 'Username tidak valid' });
  const blocked = ['hacker','cheat','spammer','fakebot','injector','bot','auto','script','hack','bypass','exploit','admin','root','system','null','undefined','anjing','kontol','memek','ngentot','bangsat','babi','goblok','idiot','fuck','shit','ass','bitch','nigger','nazi'];
  if (blocked.some(p => username.includes(p))) return responseJson(400, { error: 'Username tidak diizinkan' });
  if (!VALID_DIFFS.includes(difficulty)) return responseJson(400, { error: 'Invalid difficulty' });
  if (!VALID_OPS.includes(operation)) return responseJson(400, { error: 'Invalid operation' });
  if (!Array.isArray(questions) || questions.length !== 20) return responseJson(400, { error: 'Need exactly 20 questions' });
  if (!Array.isArray(userAnswers) || userAnswers.length !== 20) return responseJson(400, { error: 'Need exactly 20 answers' });
  const durationNum = Number(duration);
  const durationSec = Number.isFinite(durationNum) && durationNum > 0 && durationNum <= 300 ? durationNum : 40;
  const remainingMs = Number(timeRemaining);
  if (!Number.isFinite(remainingMs) || remainingMs < 0 || remainingMs > durationSec * 1000 + 50) return responseJson(400, { error: 'Invalid time' });
  const quizElapsedMax = Math.max(0, verified.ageSeconds - 5);
  const maxRemainingMs = Math.max(0, (durationSec - quizElapsedMax) * 1000 + 5000);
  if (remainingMs > maxRemainingMs) {
    console.warn(`[TIME CHEAT] ${username} — TR=${remainingMs}ms age=${verified.ageSeconds.toFixed(2)}s`);
    return responseJson(400, { error: 'timeRemaining tidak masuk akal.' });
  }
  const cooldown = await isOnCooldown(ip);
  if (!cooldown.ok) return responseJson(503, { error: 'Leaderboard sementara tidak tersedia. Coba lagi sebentar.' });
  if (cooldown.onCooldown) return responseJson(429, { error: 'Kamu baru saja submit! Tunggu 30 menit sebelum submit lagi. Gunakan waktu itu untuk latihan 😄' });
  const consumed = await consumeTokenOnce(verified.nonce, verified.ageSeconds);
  if (!consumed.ok) {
    if (consumed.reason === 'Token replayed') return responseJson(403, { error: 'Token sudah digunakan. Mulai quiz baru untuk submit skor.' });
    console.error('[REPLAY PROTECTION UNAVAILABLE]', consumed.reason);
    return responseJson(503, { error: 'Sistem validasi sementara tidak tersedia. Coba lagi sebentar.' });
  }
  let correct = 0;
  let wrong = 0;
  let answered = 0;
  let currentStreak = 0;
  let maxStreak = 0;
  let streakBonus = 0;
  const usedPairs = new Set();
  for (let i = 0; i < 20; i++) {
    const parsed = parseQuestion(questions[i]?.question, operation, difficulty);
    if (!parsed.ok) return responseJson(400, { error: `${parsed.error} at question ${i}` });
    if (usedPairs.has(parsed.pairKey)) return responseJson(400, { error: `Duplicate question at ${i}` });
    usedPairs.add(parsed.pairKey);
    const answer = normalizeAnswer(userAnswers[i]);
    if (answer === 'invalid') return responseJson(400, { error: `Invalid answer at question ${i}` });
    if (answer === null) { currentStreak = 0; continue; }
    answered++;
    if (answer === parsed.correctAns) {
      correct++;
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
      if (currentStreak >= 3) streakBonus += 50;
    } else {
      wrong++;
      currentStreak = 0;
    }
  }
  if (answered > 0 && verified.ageSeconds < answered * 0.4) return responseJson(400, { error: 'Timing anomaly detected' });
  const timingError = validateAnswerTiming(answerTimestamps, difficulty);
  if (timingError) return responseJson(403, { error: timingError });
  const cfg = SCORING[difficulty];
  const baseScore = correct * 500;
  const speedBonus = correct > 0 ? Math.floor((remainingMs * remainingMs) / cfg.divisor) : 0;
  const penalty = wrong * cfg.penaltyPer;
  let finalScore = Math.floor((baseScore + speedBonus + streakBonus - penalty) * cfg.multiplier);
  if (finalScore < 0) finalScore = 0;
  const breakdown = { baseScore, speedBonus, streakBonus, penalty, multiplier: cfg.multiplier, maxStreak };
  if (finalScore === 0) return responseJson(200, { score: 0, submitted: false, breakdown });
  const supabaseUrl = (typeof process !== 'undefined' && process.env?.SUPABASE_URL) || globalThis.__env__?.SUPABASE_URL;
  const serviceKey = (typeof process !== 'undefined' && process.env?.SUPABASE_SERVICE_KEY) || globalThis.__env__?.SUPABASE_SERVICE_KEY;
  const currentSeason = Number((typeof process !== 'undefined' && process.env?.CURRENT_SEASON) || globalThis.__env__?.CURRENT_SEASON || 2);
  if (!supabaseUrl || !serviceKey || !Number.isInteger(currentSeason)) return responseJson(500, { error: 'Server config error' });
  try {
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/rpc/upsert_score_if_higher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'params=single-object' },
      body: JSON.stringify({ p_username: username, p_score: finalScore, p_difficulty: difficulty, p_operation: operation, p_correct: correct, p_wrong: wrong, p_time_remaining: Math.round(remainingMs), p_session_token: sessionToken, p_season: currentSeason }),
    });
    if (!dbRes.ok) {
      const text = await dbRes.text();
      console.error(`[SUPABASE ERROR] ${dbRes.status} ${text.slice(0, 500)}`);
      return responseJson(500, { error: 'Database error. Coba lagi sebentar.' });
    }
    const rpcResult = await dbRes.json();
    if (rpcResult?.action === 'kept') {
      return responseJson(200, { score: finalScore, submitted: false, breakdown, message: `Skor kamu (${finalScore}) tidak mengalahkan rekor sebelumnya (${rpcResult.score}). Coba lagi!` });
    }
  } catch (err) {
    console.error('[SUPABASE FETCH ERROR]', err);
    return responseJson(500, { error: 'Network error. Coba lagi sebentar.' });
  }
  if (!(await setCooldown(ip, 1800))) console.warn('[REDIS COOLDOWN SET FAILED] score accepted without cooldown');
  return responseJson(200, { score: finalScore, submitted: true, breakdown });
}
