-- =============================================================================
-- 40s Math Challenge — Emergency Cleanup + Schema Migration
-- Run this in the Supabase SQL Editor.
--
-- What it does:
--   1. Creates the scores table (idempotent) if it does not exist.
--   2. Adds the new `operation` column for the multi-operation feature.
--   3. Fixes the unique index to include `season` so each user keeps ONE best
--      score per difficulty PER season.
--   4. (Re)creates `upsert_score_if_higher` RPC used by /api/submit.js.
--   5. Creates the `app_config` table + `increment_season` RPC used by the
--      weekly-reset cron (/api/weekly-reset.js).
--   6. Runs an emergency cleanup of bot/spam/duplicate rows.
-- =============================================================================

-- ── 1. scores table (idempotent) ────────────────────────────────────────────
create table if not exists scores (
  id bigint generated always as identity primary key,
  username text not null,
  score integer not null,
  correct integer not null default 0,
  wrong integer not null default 0,
  time_remaining integer not null default 0,
  difficulty text not null,
  operation text not null default 'multiplication',
  session_token text,
  season integer not null default 2,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── 2. Add operation column on existing installs ────────────────────────────
alter table scores add column if not exists operation text default 'multiplication';
alter table scores add column if not exists updated_at timestamptz default now();

-- ── 3. Fix unique constraint: best score per user per difficulty PER SEASON ─
drop index if exists scores_username_difficulty_idx;
create unique index scores_username_difficulty_season_idx
  on scores (lower(trim(username)), difficulty, season);

-- Index for leaderboard queries
create index if not exists scores_difficulty_score_idx
  on scores (difficulty, season, score desc);

-- ── 4. upsert_score_if_higher RPC (used by /api/submit.js) ─────────────────
-- Server-side "keep highest score per user per difficulty per season".
-- Returns: { action: 'inserted' | 'updated' | 'kept', score, id }
create or replace function upsert_score_if_higher(
  p_username text,
  p_score integer,
  p_difficulty text,
  p_operation text default 'multiplication',
  p_correct integer default 0,
  p_wrong integer default 0,
  p_time_remaining integer default 0,
  p_session_token text default null,
  p_season integer default 2
) returns json
language plpgsql security definer
as $$
declare
  v_id bigint;
  v_prev_score integer;
  v_action text;
  v_username text := lower(trim(p_username));
begin
  select id, score into v_id, v_prev_score
  from scores
  where lower(trim(username)) = v_username
    and difficulty = p_difficulty
    and season = p_season
  limit 1;

  if v_id is null then
    insert into scores (username, score, correct, wrong, time_remaining, difficulty, operation, session_token, season)
    values (v_username, p_score, p_correct, p_wrong, p_time_remaining, p_difficulty, coalesce(p_operation, 'multiplication'), p_session_token, p_season)
    returning id into v_id;
    v_action := 'inserted';
    return json_build_object('action', v_action, 'score', p_score, 'id', v_id);
  end if;

  if p_score > v_prev_score then
    update scores
    set score = p_score,
        correct = p_correct,
        wrong = p_wrong,
        time_remaining = p_time_remaining,
        operation = coalesce(p_operation, 'multiplication'),
        session_token = p_session_token,
        updated_at = now()
    where id = v_id;
    v_action := 'updated';
    return json_build_object('action', v_action, 'score', p_score, 'id', v_id);
  end if;

  return json_build_object('action', 'kept', 'score', v_prev_score, 'id', v_id);
end;
$$;

-- ── 5. app_config + increment_season RPC (used by /api/weekly-reset.js) ─────
create table if not exists app_config (
  key text primary key,
  value integer not null default 2
);
insert into app_config (key, value) values ('current_season', 2)
  on conflict (key) do nothing;

create or replace function increment_season() returns json
language plpgsql security definer
as $$
declare
  v_new integer;
begin
  insert into app_config (key, value) values ('current_season', 2)
    on conflict (key) do nothing;
  update app_config set value = value + 1 where key = 'current_season'
    returning value into v_new;
  return json_build_object('new_season', v_new);
end;
$$;

-- ── 6. Row Level Security ───────────────────────────────────────────────────
alter table scores enable row level security;

drop policy if exists "Anyone can read scores" on scores;
create policy "Anyone can read scores"
  on scores for select using (true);

drop policy if exists "Anyone can insert scores" on scores;
create policy "Anyone can insert scores"
  on scores for insert with check (true);

-- ── 7. Emergency cleanup ────────────────────────────────────────────────────
-- a) Remove duplicate rows for the same user/difficulty/season — keep highest.
delete from scores a
using scores b
where a.id < b.id
  and lower(trim(a.username)) = lower(trim(b.username))
  and a.difficulty = b.difficulty
  and a.season = b.season
  and a.score < b.score;

-- b) Remove scores with bot-pattern usernames (hex suffixes, high entropy).
delete from scores
where username ~* '^[a-z]+_[0-9a-f]{3,8}$'
   or username ~* '[^aeiou]{5,}';

-- c) Remove impossible / obviously-cheated scores (remaining time > max session 300s).
delete from scores
where correct > 0
  and time_remaining > 300000;

-- d) Remove scores with zero points (they were never meant to be saved).
delete from scores where score = 0;
