-- M27: Synchronizing the library (own puzzles and drafts) and the progress with the account.
--
-- Every change gets a change number (`rev`) from a counter per account. Devices pull everything after the last
-- number they saw (sync_pull), then push their own changes (sync_push). A counter instead of a timestamp, because
-- concurrent transactions do not commit in the order of their timestamps; sync_push locks the counter row, so
-- the numbers of one account are handed out one transaction after the other.
-- Puzzles: the newer change wins (`updated_at`, set by the device that changed it, capped at the server time).
-- Deletions stay as tombstones (`deleted`, no document). Progress: solved anywhere and the best values count.
-- Limits (also in SYNC, src/core/sync.ts): 500 puzzles, 2 000 rows with tombstones, 64 KB per document,
-- 5 000 progress rows, 100 pictures per account.

create table public.sync_state (
  user_id uuid primary key references auth.users on delete cascade,
  rev bigint not null default 0
);

create table public.sync_puzzles (
  user_id uuid not null references auth.users on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  doc jsonb,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  rev bigint not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, id),
  check (case when deleted then doc is null else jsonb_typeof(doc) = 'object' and octet_length(doc::text) <= 65536 end)
);
create index sync_puzzles_rev on public.sync_puzzles (user_id, rev);

create table public.sync_progress (
  user_id uuid not null references auth.users on delete cascade,
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  solved boolean not null check (solved),
  best_moves integer not null check (best_moves >= 0),
  best_time_ms integer check (best_time_ms >= 0),
  rev bigint not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index sync_progress_rev on public.sync_progress (user_id, rev);

alter table public.sync_state enable row level security;
alter table public.sync_puzzles enable row level security;
alter table public.sync_progress enable row level security;
revoke all on public.sync_state, public.sync_puzzles, public.sync_progress from public, anon, authenticated;
-- Only reading the own rows; all writes go through sync_push().
grant select on public.sync_puzzles, public.sync_progress to authenticated;
create policy "own synced puzzles" on public.sync_puzzles for select to authenticated using (user_id = (select auth.uid()));
create policy "own synced progress" on public.sync_progress for select to authenticated using (user_id = (select auth.uid()));

-- Everything of the caller changed after `after_rev`, oldest change first; at most 200 rows per call.
create function public.sync_pull(after_rev bigint, max_rows integer default 100)
returns table (kind text, id text, doc jsonb, updated_at timestamptz, deleted boolean, solved boolean, best_moves integer, best_time_ms integer, rev bigint)
language sql stable security invoker set search_path = '' as $$
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
  ) r (kind, id, doc, updated_at, deleted, solved, best_moves, best_time_ms, rev)
  order by r.rev
  limit least(greatest(max_rows, 1), 200);
$$;

-- Stores the caller's changes: puzzles [{id, doc, updated_at, deleted}] (at most 50) and progress
-- [{key, solved, best_moves, best_time_ms}] (at most 500). Returns {cursor, rejected: [{id, reason}]}:
-- `cursor` is the new change number if the device had seen everything before (`known`), else `known` again.
create function public.sync_push(known bigint, puzzles jsonb default '[]', progress jsonb default '[]')
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
     or jsonb_array_length(puzzles) > 50 or jsonb_array_length(progress) > 500 then
    raise exception 'batch' using errcode = 'PT400';
  end if;

  insert into public.sync_state (user_id) values (uid) on conflict (user_id) do nothing;
  select s.rev into base from public.sync_state s where s.user_id = uid for update;
  next_rev := base;
  select count(*) filter (where not p.deleted), count(*) into live, total from public.sync_puzzles p where p.user_id = uid;
  select count(*) into progress_rows from public.sync_progress g where g.user_id = uid;

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
    continue when had_row and old_updated >= stamp; -- the server has this change or a newer one
    -- The same state again (e.g. from a device whose clock runs ahead, capped to the server time above).
    continue when had_row and old_deleted = gone and old_doc is not distinct from (case when gone then null else item -> 'doc' end);
    continue when gone and not had_row; -- never synced, nothing to delete elsewhere
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
      ms := least(ms, old_ms); -- least() ignores nulls
      continue when moves = old_moves and ms is not distinct from old_ms;
    elsif progress_rows >= 5000 then
      continue; -- full: progress stays on the device
    else
      progress_rows := progress_rows + 1;
    end if;

    next_rev := next_rev + 1;
    insert into public.sync_progress (user_id, key, solved, best_moves, best_time_ms, rev, changed_at)
    values (uid, item ->> 'key', true, moves, ms, next_rev, now())
    on conflict (user_id, key) do update
      set best_moves = excluded.best_moves, best_time_ms = excluded.best_time_ms, rev = excluded.rev, changed_at = excluded.changed_at;
  end loop;

  update public.sync_state s set rev = next_rev where s.user_id = uid;
  return jsonb_build_object('cursor', case when base = known then next_rev else known end, 'rejected', rejected);
end;
$$;

revoke execute on function public.sync_pull, public.sync_push from public, anon, authenticated;
grant execute on function public.sync_pull, public.sync_push to authenticated;

-- Pictures of synced puzzles: user-images/<user id>/<key>, key = SHA-256 of the bytes (like quiz-images).
-- Private; users read and write only their own folder. Files are never deleted by users: the Edge Function
-- "cleanup-images" removes folders of deleted accounts and pictures no synced puzzle uses any more.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-images', 'user-images', false, 200000, array['image/webp', 'image/jpeg']);

-- Counted with the definer's rights: a policy on storage.objects cannot query storage.objects itself.
create function public.user_image_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from storage.objects o
   where o.bucket_id = 'user-images' and o.name like (select auth.uid())::text || '/%';
$$;
revoke execute on function public.user_image_count from public, anon, authenticated;
grant execute on function public.user_image_count to authenticated;

create policy "user images: read own" on storage.objects for select to authenticated
  using (bucket_id = 'user-images' and name like (select auth.uid())::text || '/%');
create policy "user images: add own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-images'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$'
    and name like (select auth.uid())::text || '/%'
    and public.user_image_count() < 100
  );
-- Uploads use x-upsert (same key = same bytes), which needs an update policy for existing files.
create policy "user images: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'user-images' and name like (select auth.uid())::text || '/%')
  with check (bucket_id = 'user-images' and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$' and name like (select auth.uid())::text || '/%');
