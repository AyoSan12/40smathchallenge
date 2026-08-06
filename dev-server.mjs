// =============================================================================
// 40s Math Challenge — Local dev server (NO external services required)
//
// Serves index.html and mocks the two Edge Function endpoints so you can play
// the full game locally. It mirrors the real middleware/API checks where it can
// (bot UA blocking, content-type, HMAC token with IP binding, operation+duration
// validation, server-side rescoring) but does NOT talk to Supabase / Redis /
// Cloudflare. Leaderboard writes are ignored locally.
//
// Usage:
//   node dev-server.mjs            # http://localhost:3000/?dev
//   PORT=8080 node dev-server.mjs  # custom port
// Open http://localhost:3000/?dev in your browser (the ?dev bypasses Turnstile).
// =============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const SECRET = process.env.SESSION_SECRET || 'dev-secret-do-not-use-in-prod';

const BOT_UA_PATTERNS = [
  'curl', 'python', 'wget', 'axios', 'httpie', 'go-http',
  'java/', 'ruby', 'php/', 'perl/', 'libwww', 'scrapy',
  'postman', 'insomnia', 'okhttp',
];

// ── Question parsing/validation (mirrors api/submit.js) ─────────────────────
function detectOp(q) {
  if (/[×x]/.test(q)) return 'multiplication';
  if (/\+/.test(q)) return 'addition';
  if (/[−-]/.test(q)) return 'subtraction';
  if (/[÷/]/.test(q)) return 'division';
  return 'multiplication';
}

function parseQuestion(q, operation, difficulty) {
  const detected = detectOp(q);
  if (operation !== 'mixed' && detected !== operation) {
    return { ok: false, error: 'Operator mismatch' };
  }
  const RE = {
    multiplication: /^(\d+)\s*[×x]\s*(\d+)$/,
    addition:       /^(\d+)\s*\+\s*(\d+)$/,
    subtraction:    /^(\d+)\s*[−-]\s*(\d+)$/,
    division:       /^(\d+)\s*[÷/]\s*(\d+)$/,
  };
  const m = q.match(RE[detected]);
  if (!m) return { ok: false, error: 'Malformed question' };
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const err = validateRange(detected, a, b, difficulty);
  if (err) return { ok: false, error: err };

  let correctAns, pairKey;
  switch (detected) {
    case 'multiplication':
      correctAns = a * b;
      pairKey = [Math.min(a, b), Math.max(a, b)].join('x');
      break;
    case 'addition':
      correctAns = a + b;
      pairKey = [Math.min(a, b), Math.max(a, b)].join('+');
      break;
    case 'subtraction':
      correctAns = a - b;
      pairKey = `${a}-${b}`;
      break;
    case 'division':
      if (b === 0) return { ok: false, error: 'Divide by zero' };
      if (a % b !== 0) return { ok: false, error: 'Non-integer division' };
      correctAns = a / b;
      pairKey = `${a}/${b}`;
      break;
  }
  return { ok: true, a, b, correctAns, pairKey };
}

function validateRange(op, a, b, difficulty) {
  switch (op) {
    case 'multiplication':
      switch (difficulty) {
        case 'easy': {
          const ok = ((a >= 2 && a <= 5) && (b >= 2 && b <= 9)) || ((b >= 2 && b <= 5) && (a >= 2 && a <= 9));
          if (!ok) return 'Easy operand out of range';
          if (a * b >= 50) return 'Easy product too large';
          return null;
        }
        case 'normal':
          if (a < 2 || a > 9 || b < 2 || b > 9) return 'Normal operand out of range';
          return null;
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
      }
      return 'Unknown difficulty';
    case 'addition':
      switch (difficulty) {
        case 'easy':
          if (a < 2 || a > 20 || b < 2 || b > 20 || a + b > 40) return 'Easy addition out of range';
          return null;
        case 'normal':
          if (a < 11 || a > 99 || b < 11 || b > 99) return 'Normal addition out of range';
          return null;
        case 'hard':
          if (a < 101 || a > 499 || b < 101 || b > 499) return 'Hard addition out of range';
          return null;
        case 'human_calculator':
          if (a < 500 || a > 999 || b < 500 || b > 999) return 'HC addition out of range';
          return null;
      }
      return 'Unknown difficulty';
    case 'subtraction':
      switch (difficulty) {
        case 'easy':
          if (a < 10 || a > 99 || b < 1 || b > 9) return 'Easy subtraction out of range';
          return null;
        case 'normal':
          if (a < 21 || a > 99 || b < 11 || b > 99) return 'Normal subtraction out of range';
          return null;
        case 'hard':
          if (a < 201 || a > 999 || b < 101 || b > 500) return 'Hard subtraction out of range';
          return null;
        case 'human_calculator':
          if (a < 1001 || a > 9999 || b < 501 || b > 999) return 'HC subtraction out of range';
          return null;
      }
      return 'Unknown difficulty';
    case 'division':
      if (b === 0) return 'Divide by zero';
      const quotient = a / b;
      switch (difficulty) {
        case 'easy':
          if (b < 2 || b > 5 || quotient < 2 || quotient > 9) return 'Easy division out of range';
          return null;
        case 'normal':
          if (b < 2 || b > 9 || quotient < 2 || quotient > 9) return 'Normal division out of range';
          return null;
        case 'hard':
          if (b < 3 || b > 12 || quotient < 3 || quotient > 12) return 'Hard division out of range';
          return null;
        case 'human_calculator':
          if (a > 225 || b < 7 || b > 15 || quotient < 7 || quotient > 15) return 'HC division out of range';
          return null;
      }
      return 'Unknown difficulty';
    default:
      return 'Unknown operation';
  }
}

// ── Token helpers (mirrors api/start.js + api/submit.js) ────────────────────
function getIp(req) {
  return req.headers['x-real-ip']
    || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || '127.0.0.1';
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(`ip:${ip}`).digest('hex').slice(0, 16);
}

function signToken(ip) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const payload = `${timestamp}.${nonce}.${hashIp(ip)}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token, ip) {
  const parts = (token || '').split('.');
  if (parts.length !== 4) return { ok: false, reason: 'Malformed token' };
  const [timestamp, nonce, ipFingerprint, receivedSig] = parts;
  const payload = `${timestamp}.${nonce}.${ipFingerprint}`;
  if (ipFingerprint !== hashIp(ip)) return { ok: false, reason: 'IP mismatch' };
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (expected.length !== receivedSig.length) return { ok: false, reason: 'Signature mismatch' };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ receivedSig.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: 'Signature invalid' };
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return { ok: false, reason: 'Invalid timestamp' };
  return { ok: true, ageSeconds: (Date.now() - ts) / 1000 };
}

// ── Server ───────────────────────────────────────────────────────────────────
function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const isBot = BOT_UA_PATTERNS.some(p => ua.includes(p));

  if (pathname === '/api/start' && req.method === 'POST') {
    if (isBot) return json(res, 403, { error: 'Bot tidak diizinkan.' });
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return json(res, 415, { error: 'Content-Type harus application/json.' });
    }
    return json(res, 200, { sessionToken: signToken(getIp(req)) });
  }

  if (pathname === '/api/submit' && req.method === 'POST') {
    if (isBot) return json(res, 403, { error: 'Bot tidak diizinkan.' });
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return json(res, 415, { error: 'Content-Type harus application/json.' });
    }

    let body;
    try { body = JSON.parse(await readBody(req)); } catch {
      return json(res, 400, { error: 'Invalid JSON' });
    }

    const { username, difficulty, operation, duration, questions, userAnswers, timeRemaining, sessionToken } = body;

    const tok = verifyToken(sessionToken, getIp(req));
    if (!tok.ok) return json(res, 403, { error: 'Session token tidak valid. Mulai quiz dari awal.' });
    if (tok.ageSeconds > 180) return json(res, 400, { error: 'Session sudah kadaluarsa. Refresh halaman dan coba lagi.' });
    if (tok.ageSeconds < 8) return json(res, 403, { error: 'Waduuuh, kok cepet banget? Skor ditolak ya!' });

    const VALID_OPERATIONS = ['multiplication', 'addition', 'subtraction', 'division', 'mixed'];
    if (!VALID_OPERATIONS.includes(operation)) return json(res, 400, { error: 'Invalid operation' });

    const durSec = parseFloat(duration);
    const DURATION = (durSec > 0 && durSec <= 300) ? durSec : 40;
    const TR_MS = parseFloat(timeRemaining);
    if (isNaN(TR_MS) || TR_MS < 0 || TR_MS > DURATION * 1000 + 50) return json(res, 400, { error: 'Invalid time' });

    if (!Array.isArray(questions) || questions.length !== 20) return json(res, 400, { error: 'Need exactly 20 questions' });
    if (!Array.isArray(userAnswers) || userAnswers.length !== 20) return json(res, 400, { error: 'Need exactly 20 answers' });

    let correct = 0, wrong = 0, answered = 0, currentStreak = 0, maxStreak = 0, streakBonus = 0;
    const usedPairs = new Set();
    for (let i = 0; i < 20; i++) {
      const q = questions[i];
      const parsed = parseQuestion(q?.question, operation, difficulty);
      if (!parsed.ok) return json(res, 400, { error: `${parsed.error} at question ${i}` });
      if (usedPairs.has(parsed.pairKey)) return json(res, 400, { error: `Duplicate question at ${i}` });
      usedPairs.add(parsed.pairKey);

      const ua2 = userAnswers[i];
      if (ua2 !== null && ua2 !== '' && ua2 !== undefined) {
        answered++;
        if (parseInt(ua2, 10) === parsed.correctAns) {
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

    if (answered > 0 && tok.ageSeconds < answered * 0.4) {
      return json(res, 400, { error: 'Timing anomaly detected' });
    }

    const scoringConfig = {
      easy:             { multiplier: 1.0, divisor: 1600000 },
      normal:           { multiplier: 2.5, divisor: 800000 },
      hard:             { multiplier: 5.0, divisor: 400000 },
      human_calculator: { multiplier: 10.0, divisor: 200000 },
    };
    const cfg = scoringConfig[difficulty];
    if (!cfg) return json(res, 400, { error: 'Invalid difficulty' });

    const baseScore = correct * 500;
    const speedBonus = correct > 0 ? Math.floor((TR_MS * TR_MS) / cfg.divisor) : 0;
    const penalty = wrong * 200;
    let finalScore = Math.floor((baseScore + speedBonus + streakBonus - penalty) * cfg.multiplier);
    if (finalScore < 0) finalScore = 0;

    const breakdown = { baseScore, speedBonus, streakBonus, penalty, multiplier: cfg.multiplier, maxStreak };

    if (finalScore === 0) {
      return json(res, 200, { score: 0, submitted: false, breakdown });
    }

    // Local mode: no Supabase write. Log so you can see it works.
    console.log(`[LOCAL SUBMIT] ${username} ${difficulty}/${operation} correct=${correct} wrong=${wrong} score=${finalScore}`);
    return json(res, 200, { score: finalScore, submitted: true, breakdown });
  }

  if (pathname === '/api/weekly-reset' && req.method === 'POST') {
    return json(res, 200, { ok: true, message: 'Local mode: season reset no-op' });
  }

  if (pathname === '/' || pathname === '/index.html' || !pathname.startsWith('/api/')) {
    const file = path.join(__dirname, 'index.html');
    try {
      const html = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('index.html not found');
    }
    return;
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`40s Math Challenge (local dev) running at http://localhost:${PORT}/?dev`);
});
