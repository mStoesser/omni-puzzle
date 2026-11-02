-- M10: Publishing. Only the Edge Function "publish" inserts puzzles, after checking them with the app's own
-- code (src/core/publish.ts). It calls this function with the service role; nobody else may execute it.

create function public.publish_puzzle(
  author uuid,
  type text,
  type_version integer,
  doc jsonb,
  content_key text,
  title text,
  description text,
  min_moves integer
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
  insert into public.puzzles (author_id, type, type_version, doc, content_key, title, description, min_moves)
  values (author, type, type_version, doc, content_key, title, description, min_moves)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.publish_puzzle from public, anon, authenticated;
grant execute on function public.publish_puzzle to service_role;
