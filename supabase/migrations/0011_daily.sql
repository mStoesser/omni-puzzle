-- M26: Puzzle of the day. One published puzzle per day (Europe/Berlin), chosen on the first request of the day
-- without a cron job, or planned in advance by moderators. Its own leaderboard counts only the first solution of the
-- day; the days a player solved make up their streak. Both tables are only reachable through the functions below,
-- so nobody can look up the puzzles planned for the coming days.
-- Apply after 0010_scores.sql (dev first): Dashboard → SQL Editor → paste → Run.

-- The day in Germany; days change at midnight Berlin time for everybody.
create function public.daily_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Berlin')::date;
$$;

create table public.daily (
  day date primary key,
  -- null: withdrawn (or nothing to choose from yet); daily_puzzle() then chooses again.
  puzzle_id uuid references public.puzzles (id) on delete set null,
  planned_by uuid references public.profiles (id) on delete set null, -- null: chosen automatically
  created_at timestamptz not null default now()
);

create index daily_puzzle_idx on public.daily (puzzle_id);

create table public.daily_scores (
  day date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The puzzle the result belongs to: the day's puzzle may be replaced later. No cascade, so a withdrawn puzzle
  -- does not break the streaks of everybody who solved it.
  puzzle_id uuid references public.puzzles (id) on delete set null,
  moves integer check (moves between 0 and 5000), -- null for types ranked by time, like scores.moves
  time_ms integer not null check (time_ms between 1 and 86400000),
  achieved_at timestamptz not null default now(),
  primary key (day, user_id)
);

create index daily_scores_user_idx on public.daily_scores (user_id, day desc);
create index daily_scores_puzzle_idx on public.daily_scores (puzzle_id);

-- Chooses the puzzle for a day: visible, by a player who is not banned, of a type with a leaderboard (types without
-- one, see `ranking` in src/puzzles/*/rules.ts, are listed here; rules.test.ts checks the list). Puzzles that never
-- were the puzzle of the day come first, then those of another type than the day before, then the most liked and
-- played. Once every puzzle had its day, the one whose day is longest ago comes back. null if there is none.
create function public.pick_daily(for_day date, exclude uuid) returns uuid
language sql volatile security definer set search_path = '' as $$
  select p.id
  from public.puzzles p
  join public.profiles pr on pr.id = p.author_id
  left join lateral (select max(d.day) as day from public.daily d where d.puzzle_id = p.id) prev on true
  where not p.hidden
    and not pr.banned
    and p.type <> all (array['quiz'])
    and p.id is distinct from exclude
  order by
    prev.day asc nulls first,
    p.type is not distinct from (
      select y.type from public.daily d join public.puzzles y on y.id = d.puzzle_id where d.day = for_day - 1
    ) asc,
    p.like_count desc,
    p.play_count desc,
    random()
  limit 1;
$$;

-- Streak of a player: days solved in a row, up to today (or yesterday, while today is still open).
create function public.daily_streak(player uuid, today date) returns integer
language sql stable security definer set search_path = '' as $$
  with solved as (
    -- Consecutive days get the same group: the day plus its position counted from the latest day.
    select ds.day, ds.day + (row_number() over (order by ds.day desc))::integer as grp
    from public.daily_scores ds
    where ds.user_id = player and ds.day <= today
  ), latest as (select max(day) as day from solved)
  select count(*)::integer from solved, latest where latest.day >= today - 1 and solved.grp = latest.day + 1;
$$;

-- Today's puzzle; chooses one on the first call of the day, and again if it was hidden or withdrawn. Concurrent
-- first calls are safe: the day is the primary key, and replacing only happens if nobody replaced it in between.
-- Always returns one row; the puzzle columns are null if there is nothing to choose from (empty gallery).
-- `solved` and `streak` are about the caller (false and null when signed out).
create function public.daily_puzzle()
returns table (day date, puzzle_id uuid, title text, type text, difficulty smallint, content_key text, solved boolean,
  streak integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  today date := public.daily_today();
  chosen uuid;
  me uuid := (select auth.uid());
begin
  select d.puzzle_id into chosen from public.daily d where d.day = today;
  if not found then
    insert into public.daily (day, puzzle_id) values (today, public.pick_daily(today, null)) on conflict do nothing;
  elsif chosen is null or not exists (select 1 from public.puzzles p where p.id = chosen and not p.hidden) then
    update public.daily d set puzzle_id = public.pick_daily(today, chosen), planned_by = null
      where d.day = today and d.puzzle_id is not distinct from chosen;
  end if;
  return query
    select today, p.id, p.title, p.type, p.difficulty, p.content_key,
      me is not null and exists (select 1 from public.daily_scores ds where ds.day = today and ds.user_id = me),
      case when me is null then null else public.daily_streak(me, today) end
    from (select 1) one
    left join public.daily d on d.day = today
    left join public.puzzles p on p.id = d.puzzle_id and not p.hidden;
end;
$$;

-- Called by the Edge Function "submit-score" after it replayed the solution (service role only). Only the first
-- solution of the day counts; solving the day before still counts shortly after midnight. Returns 'recorded',
-- 'repeat' (the player already has a result for that day) or 'expired' (not that day's puzzle, or too late).
-- If the day's puzzle was replaced, the first solution of the new one replaces a result of the old one.
create function public.submit_daily(player uuid, puzzle uuid, for_day date, move_count integer, duration_ms integer)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  today date := public.daily_today();
  stored integer;
begin
  if not exists (select 1 from public.profiles p where p.id = player and not p.banned) then
    raise exception 'banned' using errcode = 'PT403';
  end if;
  if for_day not between today - 1 and today
    or not exists (select 1 from public.daily d where d.day = for_day and d.puzzle_id = puzzle) then
    return 'expired';
  end if;
  insert into public.daily_scores as s (day, user_id, puzzle_id, moves, time_ms)
  values (for_day, player, puzzle, move_count, duration_ms)
  on conflict (day, user_id) do update
    set puzzle_id = excluded.puzzle_id, moves = excluded.moves, time_ms = excluded.time_ms, achieved_at = now()
    where s.puzzle_id is distinct from excluded.puzzle_id;
  get diagnostics stored = row_count;
  return case when stored > 0 then 'recorded' else 'repeat' end;
end;
$$;

-- The leaderboard of a day, like leaderboard() in 0010_scores.sql: top 10 plus the caller's own entry, equal results
-- share a place, banned players and the author are left out. Only results for the day's current puzzle count.
create function public.daily_leaderboard(for_day date)
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
    from public.daily d
    join public.puzzles p on p.id = d.puzzle_id
    join public.daily_scores s on s.day = d.day and s.puzzle_id = d.puzzle_id
    join public.profiles pr on pr.id = s.user_id
    where d.day = for_day
      and d.day <= public.daily_today()
      and not pr.banned
      and s.user_id <> p.author_id
      and (not p.hidden or (select public.is_moderator()))
    window w as (order by coalesce(s.moves, 0), s.time_ms)
  )
  select r.place, r.user_id, r.username, r.moves, r.time_ms, r.achieved_at, r.is_me, r.total
  from ranked r
  where r.n <= 10 or r.is_me
  order by r.n;
$$;

-- Moderation ----------------------------------------------------------------------------------------------
-- Moderators plan today and the next 14 days. Planning today replaces today's puzzle; results already given for the
-- old one keep counting for streaks, but leave the leaderboard of the day.

create function public.mod_daily_plan()
returns table (day date, puzzle_id uuid, title text, type text, hidden boolean, planned_by text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  return query
    select g.day, p.id, p.title, p.type, p.hidden, pr.username
    from (select public.daily_today() + n as day from generate_series(0, 14) n) g
    left join public.daily d on d.day = g.day
    left join public.puzzles p on p.id = d.puzzle_id
    left join public.profiles pr on pr.id = d.planned_by
    order by g.day;
end;
$$;

create function public.mod_plan_daily(for_day date, puzzle uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  if for_day not between public.daily_today() and public.daily_today() + 14 then
    raise exception 'day' using errcode = 'PT400';
  end if;
  -- Same conditions as pick_daily, apart from repetitions.
  if not exists (
    select 1 from public.puzzles p join public.profiles pr on pr.id = p.author_id
    where p.id = puzzle and not p.hidden and not pr.banned and p.type <> all (array['quiz'])
  ) then
    raise exception 'unsuitable' using errcode = 'PT400';
  end if;
  insert into public.daily (day, puzzle_id, planned_by) values (for_day, puzzle, (select auth.uid()))
  on conflict (day) do update set puzzle_id = excluded.puzzle_id, planned_by = excluded.planned_by;
end;
$$;

-- Removes a planned future day; it is then chosen automatically. Today can only be replaced.
create function public.mod_unplan_daily(for_day date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  delete from public.daily where day = for_day and day > public.daily_today();
end;
$$;

-- Privileges -----------------------------------------------------------------------------------------

revoke all on public.daily, public.daily_scores from anon, authenticated;
alter table public.daily enable row level security; -- no policies: only the functions above have access
alter table public.daily_scores enable row level security;

revoke execute on function public.daily_today, public.pick_daily, public.daily_streak, public.daily_puzzle,
  public.submit_daily, public.daily_leaderboard, public.mod_daily_plan, public.mod_plan_daily, public.mod_unplan_daily
  from public, anon, authenticated;
grant execute on function public.submit_daily to service_role;
grant execute on function public.daily_puzzle, public.daily_leaderboard to anon, authenticated;
grant execute on function public.mod_daily_plan, public.mod_plan_daily, public.mod_unplan_daily to authenticated;

-- mod_clear_scores (0010_scores.sql) also clears the daily leaderboards. Streaks of that player end with it.
create or replace function public.mod_clear_scores(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  delete from public.scores where user_id = target;
  delete from public.daily_scores where user_id = target;
end;
$$;
