-- M11: Gallery. A common difficulty scale (1 easy, 2 medium, 3 hard) for filtering and sorting.
-- Types with a solver get it from min_moves when publishing (rules.ts → levels); others later from ratings (M12).

alter table public.puzzles add column difficulty smallint check (difficulty between 1 and 3);

-- "Hardest first": level first, then moves within the level. Not null, so keyset pagination stays simple.
alter table public.puzzles add column hardness integer not null
  generated always as (coalesce(difficulty, 0) * 100000 + least(coalesce(min_moves, 0), 99999)) stored;

-- One-off backfill for puzzles published before this migration; same thresholds as src/puzzles/*/rules.ts.
update public.puzzles set difficulty = case
    when min_moves is null then null
    when type = 'rushhour' then case when min_moves <= 8 then 1 when min_moves <= 20 then 2 else 3 end
    when type = 'laser' then case when min_moves <= 3 then 1 when min_moves <= 7 then 2 else 3 end
  end;

-- One index per sort order of the gallery (id breaks ties for keyset pagination).
create index puzzles_likes_idx on public.puzzles (like_count desc, id desc) where not hidden;
create index puzzles_plays_idx on public.puzzles (play_count desc, id desc) where not hidden;
create index puzzles_hardness_idx on public.puzzles (hardness desc, id desc) where not hidden;

-- publish_puzzle gets the difficulty. The new parameter has a default, so the previously deployed
-- Edge Function keeps working until the new one is deployed.
drop function public.publish_puzzle(uuid, text, integer, jsonb, text, text, text, integer);

create function public.publish_puzzle(
  author uuid,
  type text,
  type_version integer,
  doc jsonb,
  content_key text,
  title text,
  description text,
  min_moves integer,
  difficulty smallint default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = author and not p.banned) then
    raise exception 'unknown or banned user' using errcode = 'PT403'; -- PostgREST answers with HTTP 403
  end if;
  -- PUBLISH.perDay in src/core/publish.ts. Withdrawn puzzles no longer count; good enough against spam.
  if (select count(*) from public.puzzles p where p.author_id = author and p.published_at > now() - interval '1 day') >= 10 then
    raise exception 'daily limit reached' using errcode = 'PT429';
  end if;
  -- A puzzle with the same content_key already exists: unique violation 23505, HTTP 409.
  insert into public.puzzles (author_id, type, type_version, doc, content_key, title, description, min_moves, difficulty)
  values (author, type, type_version, doc, content_key, title, description, min_moves, difficulty)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.publish_puzzle from public, anon, authenticated;
grant execute on function public.publish_puzzle to service_role;
