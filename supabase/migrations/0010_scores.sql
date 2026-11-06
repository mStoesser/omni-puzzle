-- M25: Leaderboards. One row per player and puzzle with their best result. Only the Edge Function "submit-score"
-- writes (after replaying the moves with the app's own code, src/server/score-handler.ts); everybody reads through
-- leaderboard(). The table itself is not readable, so nobody can list another player's results directly.
-- Apply after 0009_chains.sql (dev first): Dashboard → SQL Editor → paste → Run.

create table public.scores (
  puzzle_id uuid not null references public.puzzles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Counted by the function. null for types ranked by time only (nonogram): all rows of a puzzle are then null.
  moves integer check (moves between 0 and 5000), -- SCORE.maxMoves in src/core/scores.ts
  time_ms integer not null check (time_ms between 1 and 86400000), -- plausibility only, measured by the app
  achieved_at timestamptz not null default now(),
  primary key (puzzle_id, user_id)
);

-- Ranking order: fewest moves, then fastest, then who was first.
create index scores_rank_idx on public.scores (puzzle_id, moves, time_ms, achieved_at);
create index scores_user_idx on public.scores (user_id);

-- Keeps the better result: fewer moves, or as many moves in less time (with null moves: less time).
-- Returns whether the stored result changed. Banned players and authors of the puzzle are refused.
create function public.submit_score(player uuid, puzzle uuid, move_count integer, duration_ms integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  changed boolean;
begin
  if not exists (select 1 from public.profiles p where p.id = player and not p.banned) then
    raise exception 'banned' using errcode = 'PT403';
  end if;
  if exists (select 1 from public.puzzles p where p.id = puzzle and p.author_id = player) then
    raise exception 'own' using errcode = 'PT403';
  end if;
  insert into public.scores as s (puzzle_id, user_id, moves, time_ms)
  values (puzzle, player, move_count, duration_ms)
  on conflict (puzzle_id, user_id) do update
    set moves = excluded.moves, time_ms = excluded.time_ms, achieved_at = now()
    where (coalesce(excluded.moves, 0), excluded.time_ms) < (coalesce(s.moves, 0), s.time_ms)
  returning true into changed;
  return coalesce(changed, false);
end;
$$;

-- The top 10 of a puzzle plus the caller's own entry if it is further down. Equal results share a place.
-- Banned players and the author are left out (also entries from before a ban). Hidden puzzles only show their
-- leaderboard to their author and moderators, like the puzzle itself.
create function public.leaderboard(puzzle uuid)
returns table (place integer, user_id uuid, username text, moves integer, time_ms integer, achieved_at timestamptz,
  is_me boolean, total integer)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select
      (rank() over w)::integer as place,
      row_number() over (order by coalesce(s.moves, 0), s.time_ms, s.achieved_at) as n,
      s.user_id, pr.username, s.moves, s.time_ms, s.achieved_at,
      coalesce(s.user_id = (select auth.uid()), false) as is_me,
      (count(*) over ())::integer as total
    from public.scores s
    join public.puzzles p on p.id = s.puzzle_id
    join public.profiles pr on pr.id = s.user_id
    where s.puzzle_id = leaderboard.puzzle
      and not pr.banned
      and s.user_id <> p.author_id
      and (not p.hidden or p.author_id = (select auth.uid()) or (select public.is_moderator()))
    window w as (order by coalesce(s.moves, 0), s.time_ms)
  )
  select r.place, r.user_id, r.username, r.moves, r.time_ms, r.achieved_at, r.is_me, r.total
  from ranked r
  where r.n <= 10 or r.is_me
  order by r.n;
$$;

-- Moderation: removes every entry of a player, e.g. after obviously faked results.
create function public.mod_clear_scores(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  delete from public.scores where user_id = target;
end;
$$;

-- Privileges -----------------------------------------------------------------------------------------

revoke all on public.scores from anon, authenticated;
alter table public.scores enable row level security; -- no policies: only the functions above have access

revoke execute on function public.submit_score, public.leaderboard, public.mod_clear_scores from public, anon, authenticated;
grant execute on function public.submit_score to service_role;
grant execute on function public.leaderboard to anon, authenticated;
grant execute on function public.mod_clear_scores to authenticated;
