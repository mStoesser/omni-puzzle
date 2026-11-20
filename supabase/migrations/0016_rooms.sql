-- M46: Published escape rooms. Like puzzles, only the Edge Function "publish" inserts them, after checking them with the
-- app's own code (src/rooms/publish.ts: the room, every embedded puzzle, that it can be won, its pictures). Immutable
-- apart from title and description; withdrawing deletes the row. Own pictures go to quiz-images/<room id>/<key> and are
-- removed by cleanup-images once the room is gone. No likes or ratings; reports and moderation as for chains.
-- Apply after 0015_search.sql (dev first): Dashboard → SQL Editor → paste → Run.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  doc jsonb not null check (pg_column_size(doc) <= 524288), -- the EscapeRoomDocument as published (ROOM_LIMITS)
  content_key text not null unique check (content_key ~ '^[0-9a-f]{64}$'), -- hash of roomSaveKey
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  lang text check (lang in ('de', 'en')),
  -- The start scene's picture for the gallery card, so the gallery never loads whole documents:
  -- { "builtin": "study" } or { "key": "<sha-256>" } (then at quiz-images/<id>/<key>).
  cover jsonb not null check (jsonb_typeof(cover) = 'object' and pg_column_size(cover) <= 200),
  scene_count smallint not null check (scene_count between 1 and 20),
  puzzle_count smallint not null check (puzzle_count between 0 and 30),
  min_steps integer check (min_steps > 0), -- fewest actions to win; null if only the reduced search decided
  hidden boolean not null default false,
  play_count integer not null default 0,
  report_count integer not null default 0,
  published_at timestamptz not null default now(),
  author_name text, -- kept up to date by triggers, for the search (0015_search.sql)
  search_text text generated always as (lower(title || ' ' || coalesce(author_name, ''))) stored
);

create index rooms_author_idx on public.rooms (author_id);
create index rooms_published_idx on public.rooms (published_at desc, id desc) where not hidden;
create index rooms_plays_idx on public.rooms (play_count desc, id desc) where not hidden;
create index rooms_search_idx on public.rooms using gin (search_text extensions.gin_trgm_ops) where not hidden;

create trigger rooms_author_name before insert or update of author_id on public.rooms
  for each row execute function public.set_author_name();

create or replace function public.sync_author_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.puzzles set author_name = new.username where author_id = new.id;
  update public.chains set author_name = new.username where author_id = new.id;
  update public.rooms set author_name = new.username where author_id = new.id;
  return null;
end;
$$;

-- Reports are for a puzzle, a chain or a room. Same threshold (3 open reports hide it), one report per user and room.
alter table public.reports add column room_id uuid references public.rooms (id) on delete cascade;
alter table public.reports drop constraint reports_one_target;
alter table public.reports add constraint reports_one_target check (num_nonnulls(puzzle_id, chain_id, room_id) = 1);
alter table public.reports add constraint reports_room_id_reporter_id_key unique (room_id, reporter_id);

create or replace function public.count_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.puzzle_id is not null then
    update public.puzzles
      set report_count = report_count + 1, hidden = hidden or report_count + 1 >= 3
      where id = new.puzzle_id;
  elsif new.chain_id is not null then
    update public.chains
      set report_count = report_count + 1, hidden = hidden or report_count + 1 >= 3
      where id = new.chain_id;
  else
    update public.rooms
      set report_count = report_count + 1, hidden = hidden or report_count + 1 >= 3
      where id = new.room_id;
  end if;
  return null;
end;
$$;

-- Publishing -----------------------------------------------------------------------------------------
-- Called only by the Edge Function with the service role, like publish_puzzle (0004_publish.sql).

create function public.publish_room(
  author uuid,
  doc jsonb,
  content_key text,
  title text,
  description text,
  lang text,
  cover jsonb,
  scene_count smallint,
  puzzle_count smallint,
  min_steps integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = author and not p.banned) then
    raise exception 'unknown or banned user' using errcode = 'PT403';
  end if;
  -- ROOM_PUBLISH.perDay in src/rooms/publish.ts.
  if (select count(*) from public.rooms r where r.author_id = author and r.published_at > now() - interval '1 day') >= 5 then
    raise exception 'daily limit reached' using errcode = 'PT429';
  end if;
  -- A room with the same content_key already exists: unique violation 23505, HTTP 409.
  insert into public.rooms (author_id, doc, content_key, title, description, lang, cover, scene_count, puzzle_count, min_steps)
  values (author, doc, content_key, title, description, lang, cover, scene_count, puzzle_count, min_steps)
  returning id into new_id;
  return new_id;
end;
$$;

-- Counted once per device like puzzles; anonymous, deliberately not tamper-proof.
create function public.register_room_play(room uuid) returns void
language sql security definer set search_path = '' as $$
  update public.rooms set play_count = play_count + 1 where id = room and not hidden;
$$;

-- Moderation, like mod_release_chain and mod_hide_chain (0009_chains.sql).
create function public.mod_release_room(room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  update public.reports set resolved = true where room_id = room and not resolved;
  update public.rooms set hidden = false, report_count = 0 where id = room;
end;
$$;

create function public.mod_hide_room(room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  update public.reports set resolved = true where room_id = room and not resolved;
  update public.rooms set hidden = true, report_count = 0 where id = room;
end;
$$;

-- Privileges -----------------------------------------------------------------------------------------

revoke all on public.rooms from anon, authenticated;
grant select on public.rooms to anon, authenticated;
grant update (title, description) on public.rooms to authenticated;
grant delete on public.rooms to authenticated;

revoke execute on function public.publish_room, public.register_room_play, public.mod_release_room,
  public.mod_hide_room from public, anon, authenticated;
grant execute on function public.publish_room to service_role;
grant execute on function public.register_room_play to anon, authenticated;
grant execute on function public.mod_release_room, public.mod_hide_room to authenticated;

-- Row Level Security ---------------------------------------------------------------------------------

alter table public.rooms enable row level security;

create policy "visible rooms are public" on public.rooms for select
  using (not hidden or author_id = (select auth.uid()) or (select public.is_moderator()));
create policy "authors edit their rooms" on public.rooms for update to authenticated
  using (author_id = (select auth.uid()) and (select public.is_active_user()))
  with check (author_id = (select auth.uid()));
create policy "authors and moderators delete rooms" on public.rooms for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_moderator()));

create policy "users report rooms" on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid()) and (select public.is_active_user()) and not resolved
    and puzzle_id is null and chain_id is null
    and exists (select 1 from public.rooms r where r.id = room_id and not r.hidden and r.author_id <> (select auth.uid()))
  );
