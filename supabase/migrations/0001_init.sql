-- M8: base schema for the community features (gallery, accounts, likes, ratings, reports).
-- Apply by hand to both projects (dev first): Dashboard → SQL Editor → paste → Run.
--
-- Security model: the publishable key is public, so everything below is guarded by Row Level Security
-- and explicit grants. Supabase grants all privileges on new public tables to anon/authenticated by
-- default; every table here revokes that and grants only what the client needs.
-- Puzzles are inserted only by the `publish` Edge Function (service role, bypasses RLS; M10).

-- Profiles -------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 3 and 20 and username ~ '^[[:alnum:]_.-]+$'),
  is_moderator boolean not null default false, -- set by hand in the dashboard only
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index profiles_username_key on public.profiles (lower(username));

-- A profile is created together with the account; the username comes from the sign-up metadata (M9).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username) values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers for policies. Security definer, so policies can read profiles without recursion.
create function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_moderator from public.profiles where id = (select auth.uid())), false);
$$;

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select not banned from public.profiles where id = (select auth.uid())), false);
$$;

-- Puzzles --------------------------------------------------------------------------------------------

create table public.puzzles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type ~ '^[a-z0-9-]{1,32}$'),
  type_version integer not null check (type_version >= 1),
  doc jsonb not null check (pg_column_size(doc) <= 131072), -- the full PuzzleDocument as published
  content_key text not null unique check (content_key ~ '^[0-9a-f]{64}$'), -- progressKey of the doc
  -- Title and description live here (not only in doc.meta) because the author may change them later.
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  min_moves integer check (min_moves >= 0),
  hidden boolean not null default false, -- set automatically after enough reports or by a moderator
  like_count integer not null default 0,
  play_count integer not null default 0,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  report_count integer not null default 0,
  published_at timestamptz not null default now()
);

create index puzzles_author_idx on public.puzzles (author_id);
create index puzzles_published_idx on public.puzzles (published_at desc, id) where not hidden;

-- Likes, ratings, reports ----------------------------------------------------------------------------

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  puzzle_id uuid not null references public.puzzles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, puzzle_id)
);

create index likes_puzzle_idx on public.likes (puzzle_id);

create table public.ratings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  puzzle_id uuid not null references public.puzzles (id) on delete cascade,
  value smallint not null check (value between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, puzzle_id)
);

create index ratings_puzzle_idx on public.ratings (puzzle_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references public.puzzles (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('inappropriate', 'spam', 'unsolvable', 'other')),
  comment text not null default '' check (char_length(comment) <= 500),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (puzzle_id, reporter_id)
);

-- Counters -------------------------------------------------------------------------------------------
-- Kept on the puzzle row, so the gallery can sort without aggregating. Updated by triggers only.

create function public.count_like() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.puzzles set like_count = like_count + 1 where id = new.puzzle_id;
  else
    update public.puzzles set like_count = like_count - 1 where id = old.puzzle_id;
  end if;
  return null;
end;
$$;

create trigger likes_count after insert or delete on public.likes
  for each row execute function public.count_like();

create function public.count_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.puzzles set rating_sum = rating_sum - old.value, rating_count = rating_count - 1
      where id = old.puzzle_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.puzzles set rating_sum = rating_sum + new.value, rating_count = rating_count + 1
      where id = new.puzzle_id;
  end if;
  return null;
end;
$$;

create trigger ratings_count after insert or update or delete on public.ratings
  for each row execute function public.count_rating();

-- Reaching the threshold hides the puzzle until a moderator looks at it (M13).
create function public.count_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.puzzles
    set report_count = report_count + 1, hidden = hidden or report_count + 1 >= 3
    where id = new.puzzle_id;
  return null;
end;
$$;

create trigger reports_count after insert on public.reports
  for each row execute function public.count_report();

-- Play counter: callable anonymously via POST /rest/v1/rpc/register_play. Deliberately simple, not tamper-proof;
-- the client calls it once per device and puzzle.
create function public.register_play(puzzle uuid) returns void
language sql security definer set search_path = '' as $$
  update public.puzzles set play_count = play_count + 1 where id = puzzle and not hidden;
$$;

-- Ratings may only change their value; keep the timestamp current.
create function public.touch_rating() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger ratings_touch before update on public.ratings
  for each row execute function public.touch_rating();

-- Privileges -----------------------------------------------------------------------------------------

revoke all on public.profiles, public.puzzles, public.likes, public.ratings, public.reports from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update (username) on public.profiles to authenticated;

grant select on public.puzzles to anon, authenticated;
grant update (title, description) on public.puzzles to authenticated;
grant delete on public.puzzles to authenticated;

grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.ratings to authenticated;
grant update (value) on public.ratings to authenticated;
grant select, insert on public.reports to authenticated;

-- Functions are executable by PUBLIC by default. Trigger functions need no grant (checked when the trigger
-- is created); policy helpers are evaluated as the calling role and must stay executable (they only reveal
-- the caller's own status).
revoke execute on function public.handle_new_user, public.count_like, public.count_rating, public.count_report,
  public.touch_rating from public, anon, authenticated;
revoke execute on function public.is_moderator, public.is_active_user, public.register_play from public;
grant execute on function public.is_moderator, public.is_active_user, public.register_play to anon, authenticated;

-- Row Level Security ---------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.puzzles enable row level security;
alter table public.likes enable row level security;
alter table public.ratings enable row level security;
alter table public.reports enable row level security;

create policy "profiles are public" on public.profiles for select using (true);
create policy "users rename themselves" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and not banned) with check (id = (select auth.uid()));

create policy "visible puzzles are public" on public.puzzles for select
  using (not hidden or author_id = (select auth.uid()) or (select public.is_moderator()));
create policy "authors edit their puzzles" on public.puzzles for update to authenticated
  using (author_id = (select auth.uid()) and (select public.is_active_user()))
  with check (author_id = (select auth.uid()));
create policy "authors and moderators delete puzzles" on public.puzzles for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_moderator()));

-- Likes and ratings: own rows only, not on own or hidden puzzles, not when banned.
create policy "users see their likes" on public.likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "users like others' puzzles" on public.likes for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select public.is_active_user())
    and exists (select 1 from public.puzzles p where p.id = puzzle_id and not p.hidden and p.author_id <> (select auth.uid()))
  );
create policy "users unlike" on public.likes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "users see their ratings" on public.ratings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "users rate others' puzzles" on public.ratings for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select public.is_active_user())
    and exists (select 1 from public.puzzles p where p.id = puzzle_id and not p.hidden and p.author_id <> (select auth.uid()))
  );
create policy "users change their ratings" on public.ratings for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()));
create policy "users delete their ratings" on public.ratings for delete to authenticated
  using (user_id = (select auth.uid()));

-- Reports: anyone signed in may report a visible puzzle once; moderators see all reports.
create policy "users and moderators see reports" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_moderator()));
create policy "users report puzzles" on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid()) and (select public.is_active_user()) and not resolved
    and exists (select 1 from public.puzzles p where p.id = puzzle_id and not p.hidden and p.author_id <> (select auth.uid()))
  );
