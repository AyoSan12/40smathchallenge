// api/submit.js — Server-side score validator
// Menerima jawaban mentah dari client, hitung ulang skor, tulis ke Supabase.
// Client TIDAK PERNAH mengirim skor langsung — hanya soal + jawaban + sessionToken.
// sessionToken diterbitkan oleh /api/start dan ditandatangani HMAC oleh server.

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

  if (receivedSig.length !== expectedSig.length) return { ok: false, reason: 'Signature mismatch' };
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= receivedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (diff !== 0) return { ok: false, reason: 'Signature invalid' };

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return { ok: false, reason: 'Invalid timestamp' };

  const ageSeconds = (Date.now() - ts) / 1000;
  return { ok: true, ageSeconds };
}

// ── Helper: verify Cloudflare Turnstile token ────────────────────────────────
async function verifyTurnstile(token, secretKey, ip) {
  if (!token) return { ok: false, reason: 'No Turnstile token' };

  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (data.success) return { ok: true };
    return { ok: false, reason: data['error-codes']?.join(',') || 'Turnstile failed' };
  } catch (e) {
    return { ok: false, reason: 'Turnstile network error' };
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
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

  const { username, difficulty, questions, userAnswers, timeRemaining, sessionToken, turnstileToken } = body;

  const fail = (status, msg) => new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  const getEnv = (key) =>
    (typeof process !== 'undefined' && process.env?.[key]) || globalThis.__env__?.[key];

  // ── 1. Ambil semua SECRET dari environment ───────────────────────────────
  const SESSION_SECRET = getEnv('SESSION_SECRET');
  const TURNSTILE_SECRET = getEnv('TURNSTILE_SECRET_KEY');
  const SUPABASE_URL = getEnv('SUPABASE_URL');
  const SUPABASE_SERVICE_KEY = getEnv('SUPABASE_SERVICE_KEY');

  if (!SESSION_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing required env vars');
    return fail(500, 'Server config error');
  }

  // ── 2. Verify Cloudflare Turnstile (anti-bot CAPTCHA) ───────────────────
  if (TURNSTILE_SECRET) {
    const ip = req.headers.get('x-real-ip') ||
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '';
    const turnstileResult = await verifyTurnstile(turnstileToken, TURNSTILE_SECRET, ip);
    if (!turnstileResult.ok) {
      console.warn(`[TURNSTILE FAIL] ${username} — ${turnstileResult.reason}`);
      return fail(403, 'Verifikasi bot gagal. Coba lagi dari awal.');
    }
  }

  // ── 3. Verifikasi session token ──────────────────────────────────────────
  const { ok, ageSeconds, reason } = await verifySessionToken(sessionToken, SESSION_SECRET);
  if (!ok) {
    console.warn(`[TOKEN INVALID] ${username} — ${reason}`);
    return fail(403, 'Session token tidak valid. Mulai quiz dari awal.');
  }

  if (ageSeconds > 180) {
    return fail(400, 'Session sudah kedaluwarsa. Refresh halaman dan coba lagi.');
  }

  const MIN_HUMAN_TIME = 8;
  if (ageSeconds < MIN_HUMAN_TIME) {
    console.warn(`[BOT DETECTED] ${username} — completed in ${ageSeconds.toFixed(2)}s`);
    return fail(403, 'Terlalu cepat! Skor ditolak.');
  }

  // ── 4. Validasi username ─────────────────────────────────────────────────
  if (!username || typeof username !== 'string') return fail(400, 'No username');
  if (/[^\x00-\x7F]/.test(username)) return fail(400, 'Username tidak boleh pakai emoji atau karakter khusus');
  if (!/^[a-z0-9_]{2,20}$/.test(username)) return fail(400, 'Username hanya boleh huruf kecil, angka, dan underscore (2-20 karakter)');

  const BLOCKED_PATTERNS = ['hacker', 'cheat', 'spammer', 'fakebot', 'injector'];
  if (BLOCKED_PATTERNS.some(p => username.includes(p))) return fail(400, 'Username tidak diizinkan');

  // ── 5. Validasi difficulty ────────────────────────────────────────────────
  const VALID_DIFFS = ['easy', 'normal', 'hard', 'human_calculator'];
  if (!VALID_DIFFS.includes(difficulty)) return fail(400, 'Invalid difficulty');

  // ── 6. Validasi array soal & jawaban ─────────────────────────────────────
  if (!Array.isArray(questions) || questions.length !== 20) return fail(400, 'Need exactly 20 questions');
  if (!Array.isArray(userAnswers) || userAnswers.length !== 20) return fail(400, 'Need exactly 20 answers');

  // ── 7. Validasi timeRemaining ─────────────────────────────────────────────
  const TR = parseFloat(timeRemaining);
  if (isNaN(TR) || TR < 0 || TR > 40) return fail(400, 'Invalid time');

  // ── 8. Re-score di server (inti anti-cheat) ─────────────────────────────
  let correct = 0, wrong = 0, answered = 0;
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
      if (parseInt(ua) === correctAns) correct++;
      else wrong++;
    }
  }

  // ── 9. Timing sanity check ───────────────────────────────────────────────
  const MIN_PER_ANSWERED = 0.4;
  if (answered > 0 && ageSeconds < answered * MIN_PER_ANSWERED) {
    console.warn(`[CHEAT TIMING] ${username} — ${answered} jawaban dalam ${ageSeconds.toFixed(2)}s`);
    return fail(400, 'Timing anomaly detected');
  }

  // ── 10. Hitung skor di server dengan formula KONSISTEN dengan client ──────
  // PENTING: Formula ini harus SAMA dengan calculateScore() di index.html
  // Client formula: mult={easy:1.0, normal:1.5, hard:2.0, hc:3.0}, timeBonus=correct*TR*2, penalty=wrong*20
  const multipliers = { easy: 1.0, normal: 1.5, hard: 2.0, human_calculator: 3.0 };
  const timeRem = Math.round(TR);

  const base    = correct * 100;
  const penalty = wrong * 20;
  const bonus   = correct * timeRem * 2;
  const raw     = Math.max(0, base + bonus - penalty);
  let finalScore = Math.round(raw * (multipliers[difficulty] || 1.0));

  if (finalScore < 0) finalScore = 0;

  if (finalScore === 0) {
    return new Response(JSON.stringify({ score: 0, submitted: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 11. Tulis ke Supabase — only update if new score is HIGHER ────────────
  // RLS di Supabase memastikan hanya row dengan username+difficulty yang cocok yang bisa di-upsert.
  // Service key digunakan di sini (server-side only, tidak pernah expose ke client).
  try {
    // Cek skor existing
    const existing = await fetch(
      `${SUPABASE_URL}/rest/v1/scores?username=eq.${encodeURIComponent(username)}&difficulty=eq.${difficulty}&select=score`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    if (existing.ok) {
      const rows = await existing.json();
      if (rows.length > 0 && rows[0].score >= finalScore) {
        // Skor lama lebih tinggi — jangan overwrite, tapi tetap return score baru
        return new Response(JSON.stringify({ score: finalScore, submitted: false, reason: 'existing_score_higher' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Upsert skor baru (lebih tinggi dari yang lama)
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/scores?on_conflict=username,difficulty`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          username: username.toLowerCase().trim(),
          score: finalScore,
          difficulty,
          correct,
          wrong,
          time_remaining: timeRem,
          // Jangan simpan session_token ke DB — tidak perlu, dan ini mengurangi attack surface
        }),
      }
    );

    if (!dbRes.ok) {
      const errText = await dbRes.text();
      console.error('Supabase insert failed:', errText);
      return fail(500, 'Database error');
    }
  } catch (e) {
    console.error('Supabase fetch error:', e);
    return fail(500, 'Network error');
  }

  return new Response(JSON.stringify({ score: finalScore, submitted: true }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Validasi range soal per difficulty ────────────────────────────────────────
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
