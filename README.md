# 40s Math Challenge

> Can you do better than 4/19 in 40 seconds?

A viral-inspired timed multiplication challenge with 4 difficulty levels and a live global leaderboard. Built as a single HTML file — no frameworks, no build step.

**Live demo:** https://40smathchallenge.vercel.app/

---

## Origin

On April 23, 2026, a tweet went viral in Indonesia showing a Grade 11 student's math worksheet — the student answered only 4 out of 19 multiplication problems in 40 seconds (3 correct, 1 wrong). Netizens debated: is 40 seconds for 19 problems even fair?

This app turns that debate into a challenge anyone can take.

---

## Features

- **4 difficulty levels** — from kids-friendly Easy to the brutal Human Calculator mode
- **Live global leaderboard** — powered by Supabase, no login required
- **Anti-cheat system** — tab switching detection, timer integrity, paste blocking
- **Mobile-friendly** — numeric keypad on mobile, responsive layout
- **Pluggable question module system** — easy to add new question types (addition, division, etc.)
- **Zero dependencies** — single `index.html`, vanilla JS, no npm, no build step

---

## Difficulty Levels

| Difficulty | Range | Avg Time/Question | Can Finish? | Multiplier |
|---|---|---|---|---|
| Easy | 2–5 × 2–9 | ~1.2s | ✅ 100% | ×1.0 |
| Normal | 2–9 × 2–9 | ~2.0s | ✅ 100% | ×1.5 |
| Hard | 7–12 × 7–12 (no ×10) | ~3.5s | ⚠️ ~55% | ×2.0 |
| Human Calculator | 13–19 × 7–12 | ~6.0s | ❌ ~30% | ×3.0 |

**Normal** exactly matches the viral worksheet. **Hard** and **Human Calculator** are intentionally unfinishable for most people — that's the point.

---

## Scoring

```
Base Points  = correct × 100
Time Bonus   = correct × remaining_seconds × 2
Penalty      = wrong × 20
Final Score  = max(0, Base + Bonus - Penalty) × difficulty_multiplier
```

**Example** — Hard mode, 10 correct, 2 wrong, 5 seconds remaining:
```
Raw   = (10×100) + (10×5×2) - (2×20) = 1,060
Final = 1,060 × 2.0 = 2,120 points
```

Skipped questions = 0 penalty, 0 bonus.

---

## Anti-Cheat

| Threat | Method |
|---|---|
| Tab switching | `visibilitychange` + `blur` events — 1st: warning, 2nd: score voided |
| Timer manipulation | Uses `Date.now()` timestamps — cannot be faked with JS pause |
| Paste / copy | Blocked on answer input during quiz |
| Right-click | Blocked during quiz |
| DevTools shortcuts | F12, Ctrl+Shift+I/J/C, Ctrl+U all suppressed |
| Session forgery | Random `sessionToken` generated at quiz start, included in submission |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Single `index.html` — HTML + CSS + vanilla JS |
| Database | Supabase (PostgreSQL via REST API) |
| Hosting | Vercel (static) |
| Backend | None — all logic runs in browser |

---

## Self-Hosting Guide

### Step 1 — Fork this repo

Click **Fork** on GitHub, or clone it:
```bash
git clone https://github.com/YOUR_USERNAME/40smathchallenge.git
```

### Step 2 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → create a free account
2. Click **New project** → name it anything (e.g. `math-challenge`)
3. Go to **SQL Editor** → run this query:

```sql
create table scores (
  id bigint generated always as identity primary key,
  username text not null,
  score integer not null,
  correct integer not null,
  wrong integer not null,
  time_remaining integer not null,
  difficulty text not null,
  session_token text,
  created_at timestamptz default now()
);

create index on scores (difficulty, score desc);

alter table scores enable row level security;

create policy "Anyone can read scores"
  on scores for select using (true);

create policy "Anyone can insert scores"
  on scores for insert with check (true);
```

4. Go to **Project Settings → API Keys**
5. Copy your **Project URL** and **Publishable (anon) key**

### Step 3 — Configure index.html

Open `index.html` and find these two lines near the top of the `<script>` section:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

Replace with your values:

```js
const SUPABASE_URL = 'https://xxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_...';
```

> **Note:** The Publishable/anon key is safe to expose publicly — it can only read/write the `scores` table due to Row Level Security.

### Step 4 — Deploy to Vercel

1. Push your changes to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → select your repo
3. Click **Deploy** (no build settings needed)

Done! Your own instance is live. 🎉

---

## Adding New Question Types

The app uses a pluggable `QuestionModules` system. To add a new question type, insert a new key into the object in `index.html`:

```js
QuestionModules.addition = {
  name: 'Addition',
  generate(difficulty, count) {
    // Return array of { question: '7 + 9', answer: 16 }
    // difficulty = 'easy' | 'normal' | 'hard' | 'human_calculator'
  }
};
```

No other changes needed — the core engine picks it up automatically.

**Planned modules:**
- Addition
- Subtraction
- Division
- Mixed operations
- Fractions
- Percentages & mental math

---

## Project Structure

```
index.html      — Complete app (all screens, logic, styles)
vercel.json     — Vercel static deploy config
README.md       — This file
```

---

## Contributing

PRs welcome! Some ideas:

- New question modules (addition, division, mixed)
- More language support (currently English UI)
- Sound effects / haptic feedback on mobile
- Share result as image
- Embed mode for websites/blogs

---

## License

MIT — free to use, modify, and distribute.

---

## Credits

Inspired by a viral Indonesian tweet (April 2026) about a Grade 11 student's multiplication test. Built to settle the debate once and for all.
