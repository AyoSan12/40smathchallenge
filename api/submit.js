// api/submit.js — Server-side score validator
// Menerima jawaban mentah dari client, hitung ulang skor, tulis ke Supabase.
// Client TIDAK PERNAH mengirim skor langsung — hanya soal + jawaban + sessionToken.
// sessionToken diterbitkan oleh /api/start, ditandatangani HMAC, dan hanya bisa dipakai SEKALI.

export const config = {
  runtime: 'edge',
};

// ── Helper: verifikasi HMAC session token ────────────────────────────────────
async function verifySessionToken(token, secret) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'No token' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'Malformed token' };

  const [timestamp, nonce, receivedSig] = parts;
  const payload = `${timestamp}.${nonce}`;

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', keyMaterial, encoder.encode(payload));
  const expectedSig = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison untuk cegah timing attack
  if (receivedSig.length !== expectedSig.length) return { ok: false, reason: 'Signature mismatch' };
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= receivedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (diff !== 0) return { ok: false, reason: 'Signature invalid' };

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return { ok: false, reason: 'Invalid timestamp' };

  const ageSeconds = (Date.now() - ts) / 1000;
  return { ok: true, ageSeconds, nonce };
}

// ── Helper: cek & tandai token sudah dipakai (Redis) ─────────────────────────
async function consumeToken(nonce, ageSeconds) {
  const REDIS_URL = (typeof process !== 'undefined' && process.env?.UPSTASH_REDIS_REST_URL)
    || globalThis.__env__?.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = (typeof process !== 'undefined' && process.env?.UPSTASH_REDIS_REST_TOKEN)
    || globalThis.__env__?.UPSTASH_REDIS_REST_TOKEN;

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn('Redis tidak tersedia, token replay check dilewati');
    return { consumed: false };
  }

  const key = `used_token:${nonce}`;
  // TTL = sisa waktu token, minimal 60 detik
  const ttl = Math.max(60, Math.ceil(180 - ageSeconds));

  // SET NX = hanya set kalau belum ada (atomic, anti-race-condition)
  const res = await fetch(`${REDIS_URL}/set/${key}/1/ex/${ttl}/nx`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });

  if (!res.ok) return { consumed: false };

  const data = await res.json();
  // result === null berarti key sudah ada → token sudah pernah dipakai
  return { consumed: data.result === null };
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://40smathchallenge.vercel.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { username, difficulty, questions, userAnswers, timeRemaining, sessionToken } = body;

  const fail = (status, msg) => new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  // ── 1. Ambil SECRET dari environment ─────────────────────────────────────
  const SESSION_SECRET = (typeof process !== 'undefined' && process.env?.SESSION_SECRET)
    || globalThis.__env__?.SESSION_SECRET;
  if (!SESSION_SECRET) {
    console.error('SESSION_SECRET not set');
    return fail(500, 'Server config error');
  }

  // ── 2. Verifikasi session token ───────────────────────────────────────────
  console.log(`[TOKEN DEBUG] parts=${sessionToken?.split('.').length} secretLen=${SESSION_SECRET?.length}`);
  const { ok, ageSeconds, nonce, reason } = await verifySessionToken(sessionToken, SESSION_SECRET);
  if (!ok) {
    console.warn(`[TOKEN INVALID] ${username} — ${reason}`);
    return fail(403, 'Session token tidak valid. Mulai quiz dari awal.');
  }

  if (ageSeconds > 180) {
    return fail(400, 'Session sudah kadaluarsa. Refresh halaman dan coba lagi.');
  }

  const MIN_HUMAN_TIME = 8;
  if (ageSeconds < MIN_HUMAN_TIME) {
    console.warn(`[BOT DETECTED] ${username} — completed in ${ageSeconds.toFixed(2)}s`);
    return fail(403, 'Waduuuh, kok cepet banget? Kamu manusia atau kalkulator? Skor ditolak ya!');
  }

  // ── 3. Cegah token replay — token hanya boleh dipakai SEKALI ─────────────
  const { consumed } = await consumeToken(nonce, ageSeconds);
  if (consumed) {
    console.warn(`[REPLAY ATTACK] ${username} — token sudah dipakai`);
    return fail(403, 'Token sudah digunakan. Mulai quiz baru untuk submit skor.');
  }

  // ── 4. Validasi username ─────────────────────────────────────────────────
  if (!username || typeof username !== 'string') return fail(400, 'No username');
  if (/[^\x00-\x7F]/.test(username)) {
    return fail(400, 'Username tidak boleh pakai emoji atau karakter khusus');
  }
  if (!/^[a-z0-9_]{2,20}$/.test(username)) {
    return fail(400, 'Username hanya boleh huruf kecil, angka, dan underscore (2-20 karakter)');
  }
  const BLOCKED_PATTERNS = ['hacker', 'cheat', 'spammer', 'fakebot', 'injector'];
  if (BLOCKED_PATTERNS.some(p => username.includes(p))) {
    return fail(400, 'Username tidak diizinkan');
  }

  // ── 5. Validasi difficulty ────────────────────────────────────────────────
  const VALID_DIFFS = ['easy', 'normal', 'hard', 'human_calculator'];
  if (!VALID_DIFFS.includes(difficulty)) return fail(400, 'Invalid difficulty');

  // ── 6. Validasi array soal & jawaban ─────────────────────────────────────
  if (!Array.isArray(questions) || questions.length !== 20) return fail(400, 'Need exactly 20 questions');
  if (!Array.isArray(userAnswers) || userAnswers.length !== 20) return fail(400, 'Need exactly 20 answers');

  // ── 7. Validasi timeRemaining (dalam MILIDETIK) ───────────────────────────
  const TR_MS = parseFloat(timeRemaining);
  if (isNaN(TR_MS) || TR_MS < 0 || TR_MS > 40000) return fail(400, 'Invalid time');

  const maxPossibleMs = Math.max(0, (40 - ageSeconds) * 1000) + 3000;
  if (TR_MS > maxPossibleMs) {
    console.warn(`[TIME CHEAT] ${username} — TR=${TR_MS}ms tapi token age=${ageSeconds.toFixed(2)}s`);
    return fail(400, 'timeRemaining tidak masuk akal.');
  }

  // ── 8. Re-score di server ─────────────────────────────────────────────────
  let correct = 0, wrong = 0, answered = 0;
  let currentStreak = 0, maxStreak = 0, streakBonus = 0;
  const usedPairs = new Set();

  for (let i = 0; i < 20; i++) {
    const q = questions[i];
    if (!q || typeof q.question !== 'string') return fail(400, `Bad question at ${i}`);

    const match = q.question.match(/^(\d+)\s*[×x]\s*(\d+)$/);
    if (!match) return fail(400, `Malformed question at ${i}`);

    const a = parseInt(match[1]);
    const b = parseInt(match[2]);

    const pairKey = [Math.min(a, b), Math.max(a, b)].join('x');
    if (usedPairs.has(pairKey)) return fail(400, `Duplicate question at ${i}`);
    usedPairs.add(pairKey);

    const rangeError = validateRange(a, b, difficulty);
    if (rangeError) return fail(400, `${rangeError} at question ${i}`);

    const correctAns = a * b;
    const ua = userAnswers[i];
    if (ua !== null && ua !== '' && ua !== undefined) {
      answered++;
      if (parseInt(ua) === correctAns) {
        correct++;
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        if (currentStreak >= 3) streakBonus += 50;
      } else {
        wrong++;
        currentStreak = 0;
      }
    } else {
      currentStreak = 0;
    }
  }

  // ── 9. Timing sanity check ────────────────────────────────────────────────
  if (answered > 0 && ageSeconds < answered * 0.4) {
    console.warn(`[CHEAT] ${username} — ${answered} jawaban dalam ${ageSeconds.toFixed(2)}s`);
    return fail(400, 'Timing anomaly detected');
  }

  // ── 10. Hitung skor final — presisi milidetik ─────────────────────────────
  // base        = correct × 500
  // speed_bonus = TR_MS² ÷ divisor  (kuadratik — beda 100ms = beda rank)
  // streak_bonus = +50 per jawaban benar beruntun ke-3 dst
  // penalty     = wrong × 200
  // final       = floor((base + speed + streak − penalty) × multiplier)
  const scoringConfig = {
    easy:             { multiplier: 1.0,  divisor: 1_600_000, penaltyPer: 200 },
    normal:           { multiplier: 2.5,  divisor:   800_000, penaltyPer: 200 },
    hard:             { multiplier: 5.0,  divisor:   400_000, penaltyPer: 200 },
    human_calculator: { multiplier: 10.0, divisor:   200_000, penaltyPer: 200 },
  };
  const cfg        = scoringConfig[difficulty];
  const baseScore  = correct * 500;
  const speedBonus = correct > 0 ? Math.floor((TR_MS * TR_MS) / cfg.divisor) : 0;
  const penalty    = wrong * cfg.penaltyPer;
  const multiplier = cfg.multiplier;

  let finalScore = Math.floor((baseScore + speedBonus + streakBonus - penalty) * multiplier);
  if (finalScore < 0) finalScore = 0;

  const breakdown = { baseScore, speedBonus, streakBonus, penalty, multiplier, maxStreak };

  if (finalScore === 0) {
    return new Response(JSON.stringify({ score: 0, submitted: false, breakdown }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 11. Tulis ke Supabase dengan SERVICE KEY ──────────────────────────────
  const SUPABASE_URL = (typeof process !== 'undefined' && process.env?.SUPABASE_URL)
    || globalThis.__env__?.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = (typeof process !== 'undefined' && process.env?.SUPABASE_SERVICE_KEY)
    || globalThis.__env__?.SUPABASE_SERVICE_KEY;
  const CURRENT_SEASON = parseInt(
    (typeof process !== 'undefined' && process.env?.CURRENT_SEASON)
    || globalThis.__env__?.CURRENT_SEASON
    || '2'
  );

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase env vars');
    return fail(500, 'Server config error');
  }

  try {
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/upsert_score_if_higher`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          p_username: username.toLowerCase().trim(),
          p_score: finalScore,
          p_difficulty: difficulty,
          p_correct: correct,
          p_wrong: wrong,
          p_time_remaining: timeRem,
          p_session_token: sessionToken,
          p_season: CURRENT_SEASON,
        }),
      }
    );

    if (!dbRes.ok) {
      const errText = await dbRes.text();
      console.error('Supabase RPC failed:', errText);
      return fail(500, 'Database error');
    }

    const rpcResult = await dbRes.json();
    const action = rpcResult?.action;

    // Kalau skor lama lebih tinggi, kasih tahu user
    if (action === 'kept') {
      return new Response(JSON.stringify({
        score: finalScore,
        submitted: false,
        message: `Skor kamu (${finalScore}) tidak mengalahkan rekor sebelumnya (${rpcResult.score}). Coba lagi!`,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (e) {
    console.error('Supabase fetch error:', e);
    return fail(500, 'Network error');
  }

  return new Response(JSON.stringify({ score: finalScore, submitted: true, breakdown }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Validasi range soal per difficulty ───────────────────────────────────────
function validateRange(a, b, difficulty) {
  switch (difficulty) {
    case 'easy': {
      const ok = (
        ((a >= 2 && a <= 5) && (b >= 2 && b <= 9)) ||
        ((b >= 2 && b <= 5) && (a >= 2 && a <= 9))
      );
      if (!ok) return 'Easy operand out of range';
      if (a * b >= 50) return 'Easy product too large';
      return null;
    }
    case 'normal':
      if (a < 2 || a > 9 || b < 2 || b > 9) return 'Normal operand out of range';
      return null;

    case 'hard':
      if (a < 7 || a > 12 || b < 7 || b > 12) return 'Hard operand out of range';
      if (a === 10 || b === 10) return 'Hard cannot use x10';
      return null;

    case 'human_calculator': {
      const ok = (
        ((a >= 13 && a <= 19) && (b >= 7 && b <= 12)) ||
        ((b >= 13 && b <= 19) && (a >= 7 && a <= 12))
      );
      if (!ok) return 'HC operand out of range';
      if (a * b > 230) return 'HC product too large';
      if (a === 10 || b === 10) return 'HC cannot use x10';
      return null;
    }
    default:
      return 'Unknown difficulty';
  }
}
