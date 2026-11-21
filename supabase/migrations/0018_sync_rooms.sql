-- M48: Synchronizing own escape rooms and the saved games in rooms, next to puzzles and progress (0012_sync.sql).
--
-- Rooms work like puzzles: the newer change wins (`updated_at`), deletions stay as tombstones. Saved games
-- (`room:<key>` on the device, src/rooms/save.ts) are merged by the devices (src/core/sync.ts, mergeRoomSave):
-- the server keeps the last one pushed, a device that pulls it merges it with its own and pushes the result again.
-- Both share the change counter of sync_state, so one cursor covers everything.
-- Limits (also in SYNC, src/core/sync.ts): 20 rooms, 100 rows with tombstones, 512 KB per room document
-- (ROOM_LIMITS.maxDocBytes), 500 saved games with 16 KB each, and now 400 pictures per account (rooms bring up to 20).
-- Apply after 0017_rounds.sql (dev first): Dashboard → SQL Editor → paste → Run.

create table public.sync_rooms (
  user_id uuid not null references auth.users on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  doc jsonb,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  rev bigint not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, id),
  check (case when deleted then doc is null else jsonb_typeof(doc) = 'object' and octet_length(doc::text) <= 524288 end)
);
create index sync_rooms_rev on public.sync_rooms (user_id, rev);

create table public.sync_room_saves (
  user_id uuid not null references auth.users on delete cascade,
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  save jsonb not null check (jsonb_typeof(save) = 'object' and octet_length(save::text) <= 16384),
  rev bigint not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index sync_room_saves_rev on public.sync_room_saves (user_id, rev);

alter table public.sync_rooms enable row level security;
alter table public.sync_room_saves enable row level security;
revoke all on public.sync_rooms, public.sync_room_saves from public, anon, authenticated;
grant select on public.sync_rooms, public.sync_room_saves to authenticated;
create policy "own synced rooms" on public.sync_rooms for select to authenticated using (user_id = (select auth.uid()));
create policy "own synced room saves" on public.sync_room_saves for select to authenticated using (user_id = (select auth.uid()));

-- Everything of the caller changed after `after_rev`, oldest change first; at most 200 rows per call, and at most
-- 4 rooms (up to 2 MB). Rows after the last room of a full room page are left for the next call, so none is skipped.
-- Room rows: kind 'room' with id, doc, updated_at, deleted; saved games: kind 'room-save' with id = key, doc = save.
-- The columns stay those of 0012, so the function keeps its signature; older apps skip the new kinds.
drop function public.sync_pull(bigint, integer);
create function public.sync_pull(after_rev bigint, max_rows integer default 100)
returns table (kind text, id text, doc jsonb, updated_at timestamptz, deleted boolean, solved boolean, best_moves integer, best_time_ms integer, rev bigint)
language sql stable security invoker set search_path = '' as $$
  with rooms as (
    select 'room'::text as kind, m.id, m.doc, m.updated_at, m.deleted, null::boolean as solved, null::integer as best_moves,
           null::integer as best_time_ms, m.rev
      from public.sync_rooms m
     where m.user_id = (select auth.uid()) and m.rev > after_rev
     order by m.rev limit 4
  ),
  cap as (select case when count(*) = 4 then max(r.rev) end as rev from rooms r)
  select r.* from (
    (select 'puzzle'::text, p.id, p.doc, p.updated_at, p.deleted, null::boolean, null::integer, null::integer, p.rev
       from public.sync_puzzles p
      where p.user_id = (select auth.uid()) and p.rev > after_rev
      order by p.rev limit least(greatest(max_rows, 1), 200))
    union all
    (select 'progress'::text, g.key, null::jsonb, null::timestamptz, null::boolean, g.solved, g.best_moves, g.best_time_ms, g.rev
       from public.sync_progress g
      where g.user_id = (select auth.uid()) and g.rev > after_rev
      order by g.rev limit least(greatest(max_rows, 1), 200))
    union all
    (select 'room-save'::text, s.key, s.save, null::timestamptz, null::boolean, null::boolean, null::integer, null::integer, s.rev
       from public.sync_room_saves s
      where s.user_id = (select auth.uid()) and s.rev > after_rev
      order by s.rev limit least(greatest(max_rows, 1), 200))
    union all
    select * from rooms
  ) r (kind, id, doc, updated_at, deleted, solved, best_moves, best_time_ms, rev)
  where r.rev <= coalesce((select c.rev from cap c), r.rev)
  order by r.rev
  limit least(greatest(max_rows, 1), 200);
$$;

-- As in 0012, plus rooms [{id, doc, updated_at, deleted}] (at most 4) and saved games [{key, save}] (at most 100).
-- Rejected rooms come back in `rejected` with `kind: 'room'`.
drop function public.sync_push(bigint, jsonb, jsonb);
create function public.sync_push(known bigint, puzzles jsonb default '[]', progress jsonb default '[]',
                                 rooms jsonb default '[]', saves jsonb default '[]')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  base bigint;
  next_rev bigint;
  item jsonb;
  rejected jsonb := '[]'::jsonb;
  live integer;
  total integer;
  progress_rows integer;
  save_rows integer;
  old_updated timestamptz;
  old_deleted boolean;
  old_doc jsonb;
  old_moves integer;
  old_ms integer;
  had_row boolean;
  stamp timestamptz;
  gone boolean;
  moves integer;
  ms integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'PT401';
  end if;
  if jsonb_typeof(puzzles) is distinct from 'array' or jsonb_typeof(progress) is distinct from 'array'
     or jsonb_typeof(rooms) is distinct from 'array' or jsonb_typeof(saves) is distinct from 'array'
     or jsonb_array_length(puzzles) > 50 or jsonb_array_length(progress) > 500
     or jsonb_array_length(rooms) > 4 or jsonb_array_length(saves) > 100 then
    raise exception 'batch' using errcode = 'PT400';
  end if;

  insert into public.sync_state (user_id) values (uid) on conflict (user_id) do nothing;
  select s.rev into base from public.sync_state s where s.user_id = uid for update;
  next_rev := base;

  -- Puzzles (unchanged from 0012).
  select count(*) filter (where not p.deleted), count(*) into live, total from public.sync_puzzles p where p.user_id = uid;
  for item in select value from jsonb_array_elements(puzzles) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item -> 'id') is distinct from 'string'
       or (item ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(item -> 'deleted') is distinct from 'boolean'
       or jsonb_typeof(item -> 'updated_at') is distinct from 'string' then
      raise exception 'puzzle' using errcode = 'PT400';
    end if;
    gone := (item ->> 'deleted')::boolean;
    if not gone and jsonb_typeof(item -> 'doc') is distinct from 'object' then
      raise exception 'puzzle' using errcode = 'PT400';
    end if;
    begin
      stamp := least((item ->> 'updated_at')::timestamptz, clock_timestamp());
    exception when others then
      raise exception 'puzzle' using errcode = 'PT400';
    end;

    select p.updated_at, p.deleted, p.doc into old_updated, old_deleted, old_doc
      from public.sync_puzzles p where p.user_id = uid and p.id = item ->> 'id';
    had_row := found;
    continue when had_row and old_updated >= stamp;
    continue when had_row and old_deleted = gone and old_doc is not distinct from (case when gone then null else item -> 'doc' end);
    continue when gone and not had_row;
    if not gone and octet_length((item -> 'doc')::text) > 65536 then
      rejected := rejected || jsonb_build_object('id', item ->> 'id', 'reason', 'too-large');
      continue;
    end if;
    if (not gone and (not had_row or old_deleted) and live >= 500) or (not had_row and total >= 2000) then
      rejected := rejected || jsonb_build_object('id', item ->> 'id', 'reason', 'limit');
      continue;
    end if;

    next_rev := next_rev + 1;
    insert into public.sync_puzzles (user_id, id, doc, updated_at, deleted, rev, changed_at)
    values (uid, item ->> 'id', case when gone then null else item -> 'doc' end, stamp, gone, next_rev, now())
    on conflict (user_id, id) do update
      set doc = excluded.doc, updated_at = excluded.updated_at, deleted = excluded.deleted, rev = excluded.rev, changed_at = excluded.changed_at;
    if not had_row then
      total := total + 1;
    end if;
    live := live + (case when gone then 0 else 1 end) - (case when had_row and not old_deleted then 1 else 0 end);
  end loop;

  -- Rooms: the same rules with their own limits.
  select count(*) filter (where not m.deleted), count(*) into live, total from public.sync_rooms m where m.user_id = uid;
  for item in select value from jsonb_array_elements(rooms) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item -> 'id') is distinct from 'string'
       or (item ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(item -> 'deleted') is distinct from 'boolean'
       or jsonb_typeof(item -> 'updated_at') is distinct from 'string' then
      raise exception 'room' using errcode = 'PT400';
    end if;
    gone := (item ->> 'deleted')::boolean;
    if not gone and (jsonb_typeof(item -> 'doc') is distinct from 'object' or (item -> 'doc' ->> 'kind') is distinct from 'escape-room') then
      raise exception 'room' using errcode = 'PT400';
    end if;
    begin
      stamp := least((item ->> 'updated_at')::timestamptz, clock_timestamp());
    exception when others then
      raise exception 'room' using errcode = 'PT400';
    end;

    select m.updated_at, m.deleted, m.doc into old_updated, old_deleted, old_doc
      from public.sync_rooms m where m.user_id = uid and m.id = item ->> 'id';
    had_row := found;
    continue when had_row and old_updated >= stamp;
    continue when had_row and old_deleted = gone and old_doc is not distinct from (case when gone then null else item -> 'doc' end);
    continue when gone and not had_row;
    if not gone and octet_length((item -> 'doc')::text) > 524288 then
      rejected := rejected || jsonb_build_object('id', item ->> 'id', 'reason', 'too-large', 'kind', 'room');
      continue;
    end if;
    if (not gone and (not had_row or old_deleted) and live >= 20) or (not had_row and total >= 100) then
      rejected := rejected || jsonb_build_object('id', item ->> 'id', 'reason', 'limit', 'kind', 'room');
      continue;
    end if;

    next_rev := next_rev + 1;
    insert into public.sync_rooms (user_id, id, doc, updated_at, deleted, rev, changed_at)
    values (uid, item ->> 'id', case when gone then null else item -> 'doc' end, stamp, gone, next_rev, now())
    on conflict (user_id, id) do update
      set doc = excluded.doc, updated_at = excluded.updated_at, deleted = excluded.deleted, rev = excluded.rev, changed_at = excluded.changed_at;
    if not had_row then
      total := total + 1;
    end if;
    live := live + (case when gone then 0 else 1 end) - (case when had_row and not old_deleted then 1 else 0 end);
  end loop;

  -- Progress (unchanged from 0012).
  select count(*) into progress_rows from public.sync_progress g where g.user_id = uid;
  for item in select value from jsonb_array_elements(progress) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item -> 'key') is distinct from 'string'
       or (item ->> 'key') !~ '^[0-9a-f]{64}$' or (item -> 'solved') is distinct from 'true'::jsonb
       or jsonb_typeof(item -> 'best_moves') is distinct from 'number' or (item ->> 'best_moves') !~ '^\d{1,9}$'
       or (jsonb_typeof(item -> 'best_time_ms') is distinct from 'null'
           and (jsonb_typeof(item -> 'best_time_ms') is distinct from 'number' or (item ->> 'best_time_ms') !~ '^\d{1,10}$'
                or (item ->> 'best_time_ms')::bigint > 2147483647)) then
      raise exception 'progress' using errcode = 'PT400';
    end if;
    moves := (item ->> 'best_moves')::integer;
    ms := (item ->> 'best_time_ms')::integer;

    select g.best_moves, g.best_time_ms into old_moves, old_ms
      from public.sync_progress g where g.user_id = uid and g.key = item ->> 'key';
    had_row := found;
    if had_row then
      moves := least(moves, old_moves);
      ms := least(ms, old_ms);
      continue when moves = old_moves and ms is not distinct from old_ms;
    elsif progress_rows >= 5000 then
      continue;
    else
      progress_rows := progress_rows + 1;
    end if;

    next_rev := next_rev + 1;
    insert into public.sync_progress (user_id, key, solved, best_moves, best_time_ms, rev, changed_at)
    values (uid, item ->> 'key', true, moves, ms, next_rev, now())
    on conflict (user_id, key) do update
      set best_moves = excluded.best_moves, best_time_ms = excluded.best_time_ms, rev = excluded.rev, changed_at = excluded.changed_at;
  end loop;

  -- Saved games: the device already merged; the same save again changes nothing, a full account keeps new ones local.
  select count(*) into save_rows from public.sync_room_saves s where s.user_id = uid;
  for item in select value from jsonb_array_elements(saves) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item -> 'key') is distinct from 'string'
       or (item ->> 'key') !~ '^[0-9a-f]{64}$' or jsonb_typeof(item -> 'save') is distinct from 'object' then
      raise exception 'save' using errcode = 'PT400';
    end if;
    continue when octet_length((item -> 'save')::text) > 16384;
    select s.save into old_doc from public.sync_room_saves s where s.user_id = uid and s.key = item ->> 'key';
    had_row := found;
    continue when had_row and old_doc = item -> 'save';
    if not had_row then
      continue when save_rows >= 500;
      save_rows := save_rows + 1;
    end if;

    next_rev := next_rev + 1;
    insert into public.sync_room_saves (user_id, key, save, rev, changed_at)
    values (uid, item ->> 'key', item -> 'save', next_rev, now())
    on conflict (user_id, key) do update set save = excluded.save, rev = excluded.rev, changed_at = excluded.changed_at;
  end loop;

  update public.sync_state s set rev = next_rev where s.user_id = uid;
  return jsonb_build_object('cursor', case when base = known then next_rev else known end, 'rejected', rejected);
end;
$$;

revoke execute on function public.sync_pull, public.sync_push from public, anon, authenticated;
grant execute on function public.sync_pull, public.sync_push to authenticated;

-- Pictures: rooms bring up to 20 own pictures each, so the account limit grows from 100 to 400.
drop policy "user images: add own" on storage.objects;
create policy "user images: add own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-images'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$'
    and name like (select auth.uid())::text || '/%'
    and public.user_image_count() < 400
  );
