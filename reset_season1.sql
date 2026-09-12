-- 40s Math Challenge — FULL PLAYER RESET TO SEASON 1
-- Run this once in the Supabase SQL Editor.
-- This intentionally deletes ALL player score/progress rows and resets the
-- application's current season to Season 1.

begin;

-- Remove every stored player result from every previous season.
delete from scores;

-- Reset the global season counter to Season 1.
insert into app_config (key, value)
values ('current_season', 1)
on conflict (key) do update
set value = 1;

commit;

-- Verification:
select count(*) as remaining_scores
from scores;

select key, value as current_season
from app_config
where key = 'current_season';
