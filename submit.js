// api/submit.js — Server-side score validator
// Receives raw answers from client, recomputes score, then writes to Supabase
// Client NEVER submits a score directly — only questions + answers

export default async function handler(req, res) {
  // CORS for the same origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Parse body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { username, difficulty, questions, userAnswers, timeRemaining, sessionToken } = body;

  // ── 1. Validate username ────────────────────────────────────────────────────
  if (!username || typeof username !== 'string') return res.status(400).json({ error: 'No username' });
  if (!/^[a-z0-9_]{2,20}$/.test(username)) return res.status(400).json({ error: 'Invalid username format' });

  const BLOCKED_PATTERNS = ['hacker', 'cheat', 'spammer', 'fakebot', 'injector'];
  if (BLOCKED_PATTERNS.some(p => username.includes(p))) {
    return res.status(400).json({ error: 'Username not allowed' });
  }

  // ── 2. Validate difficulty ──────────────────────────────────────────────────
  const VALID_DIFFS = ['easy', 'normal', 'hard', 'human_calculator'];
  if (!VALID_DIFFS.includes(difficulty)) return res.status(400).json({ error: 'Invalid difficulty' });

  // ── 3. Validate arrays ──────────────────────────────────────────────────────
  if (!Array.isArray(questions) || questions.length !== 20) return res.status(400).json({ error: 'Need exactly 20 questions' });
  if (!Array.isArray(userAnswers) || userAnswers.length !== 20) return res.status(400).json({ error: 'Need exactly 20 answers' });

  // ── 4. Validate timeRemaining ───────────────────────────────────────────────
  const TR = parseFloat(timeRemaining);
  if (isNaN(TR) || TR < 0 || TR > 40) return res.status(400).json({ error: 'Invalid time' });

  // ── 5. Server-side re-score (the core anti-cheat) ──────────────────────────
  let correct = 0, wrong = 0, answered = 0;
  const usedPairs = new Set();

  for (let i = 0; i < 20; i++) {
    const q = questions[i];
    if (!q || typeof q.question !== 'string') return res.status(400).json({ error: `Bad question at ${i}` });

    // Parse "A × B" format
    const match = q.question.match(/^(\d+)\s*[×x]\s*(\d+)$/);
    if (!match) return res.status(400).json({ error: `Malformed question at ${i}` });

    const a = parseInt(match[1]);
    const b = parseInt(match[2]);

    // No duplicate questions
    const pairKey = [Math.min(a,b), Math.max(a,b)].join('x');
    if (usedPairs.has(pairKey)) return res.status(400).json({ error: `Duplicate question at ${i}` });
    usedPairs.add(pairKey);

    // Validate question is valid for this difficulty
    const rangeError = validateRange(a, b, difficulty);
    if (rangeError) return res.status(400).json({ error: `${rangeError} at question ${i}` });

    // Score the answer
    const correctAns = a * b;
    const ua = userAnswers[i];
    if (ua !== null && ua !== '' && ua !== undefined) {
      answered++;
      if (parseInt(ua) === correctAns) correct++;
      else wrong++;
    }
  }

  // ── 6. Timing sanity check ──────────────────────────────────────────────────
  // Even typing "6" + Enter takes at least 0.4s. 20 questions at that speed = 8s minimum.
  const timeElapsed = 40 - TR;
  const MIN_PER_ANSWERED = 0.4; // seconds — very generous floor
  if (answered > 0 && timeElapsed < answered * MIN_PER_ANSWERED) {
    console.warn(`[CHEAT] ${username} answered ${answered} in ${timeElapsed.toFixed(2)}s`);
    return res.status(400).json({ error: 'Timing anomaly detected' });
  }

  // ── 7. Compute final score server-side ──────────────────────────────────────
  const MULT = { easy: 1.0, normal: 1.5, hard: 2.0, human_calculator: 3.0 }[difficulty];
  const timeRem = Math.round(TR);
  const base = correct * 100;
  const bonus = correct * timeRem * 2;
  const penalty = wrong * 20;
  const finalScore = Math.round(Math.max(0, base + bonus - penalty) * MULT);

  if (finalScore === 0) {
    return res.status(200).json({ score: 0, submitted: false });
  }

  // ── 8. Write to Supabase using SERVICE KEY (never exposed to client) ─────────
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase env vars');
    return res.status(500).json({ error: 'Server config error' });
  }

  try {
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/scores?on_conflict=username,difficulty`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        username: username.toLowerCase().trim(),
        score: finalScore,
        difficulty: difficulty,
        correct: correct,
        wrong: wrong,
        time_remaining: timeRem,
        session_token: sessionToken || '',
      }),
    });

    if (!dbRes.ok) {
      const errText = await dbRes.text();
      console.error('Supabase insert failed:', errText);
      return res.status(500).json({ error: 'Database error' });
    }
  } catch (e) {
    console.error('Supabase fetch error:', e);
    return res.status(500).json({ error: 'Network error' });
  }

  return res.status(200).json({ score: finalScore, submitted: true });
}

// ── Difficulty range validator ────────────────────────────────────────────────
function validateRange(a, b, difficulty) {
  switch (difficulty) {
    case 'easy':
      // One operand in [2,5], other in [2,9], product < 50
      const easyOk = (
        ((a >= 2 && a <= 5) && (b >= 2 && b <= 9)) ||
        ((b >= 2 && b <= 5) && (a >= 2 && a <= 9))
      );
      if (!easyOk) return 'Easy operand out of range';
      if (a * b >= 50) return 'Easy product too large';
      return null;

    case 'normal':
      if (a < 2 || a > 9 || b < 2 || b > 9) return 'Normal operand out of range';
      return null;

    case 'hard':
      if (a < 7 || a > 12 || b < 7 || b > 12) return 'Hard operand out of range';
      if (a === 10 || b === 10) return 'Hard cannot use ×10';
      return null;

    case 'human_calculator':
      // One operand [13,19], other [7,12], product <= 230
      const hcOk = (
        ((a >= 13 && a <= 19) && (b >= 7 && b <= 12)) ||
        ((b >= 13 && b <= 19) && (a >= 7 && a <= 12))
      );
      if (!hcOk) return 'HC operand out of range';
      if (a * b > 230) return 'HC product too large';
      if (a === 10 || b === 10) return 'HC cannot use ×10';
      return null;

    default:
      return 'Unknown difficulty';
  }
}
