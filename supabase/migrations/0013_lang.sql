-- M28: Language per puzzle. The document carries it as meta.lang ("de" | "en", optional); the publish
-- function copies it into its own column so the gallery can filter by it. Puzzles without a language
-- (published before M28, or puzzles without text) have null and appear only under "all languages".

alter table public.puzzles add column lang text check (lang in ('de', 'en'));
update public.puzzles set lang = doc -> 'meta' ->> 'lang' where doc -> 'meta' ->> 'lang' in ('de', 'en');

-- publish_puzzle gets the language. The new parameter has a default, so the previously deployed
-- Edge Function keeps working until the new one is deployed.
drop function public.publish_puzzle(uuid, text, integer, jsonb, text, text, text, integer, smallint);

create function public.publish_puzzle(
  author uuid,
  type text,
  type_version integer,
  doc jsonb,
  content_key text,
  title text,
  description text,
  min_moves integer,
  difficulty smallint default null,
  lang text default null
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
  -- The language is not part of the content key: the same puzzle in two languages is a duplicate.
  insert into public.puzzles (author_id, type, type_version, doc, content_key, title, description, min_moves, difficulty, lang)
  values (author, type, type_version, doc, content_key, title, description, min_moves, difficulty, lang)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.publish_puzzle from public, anon, authenticated;
grant execute on function public.publish_puzzle to service_role;
