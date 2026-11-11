-- M37: Search in the gallery by title or author, for puzzles and chains.
--
-- PostgREST cannot filter with one `or` over a column and an embedded resource (the author's name), and the gallery
-- already uses `or` for keyset pagination. So each table gets the author's name as a column (kept up to date by
-- triggers) and a generated column `search_text` = lower(title + author). The app filters it word by word:
--   and=(search_text.ilike."*word1*",search_text.ilike."*word2*")
-- A trigram index makes these substring searches fast (pg_trgm, in Supabase's extensions schema).

create extension if not exists pg_trgm with schema extensions;

alter table public.puzzles add column author_name text;
alter table public.chains add column author_name text;

update public.puzzles p set author_name = pr.username from public.profiles pr where pr.id = p.author_id;
update public.chains c set author_name = pr.username from public.profiles pr where pr.id = c.author_id;

alter table public.puzzles add column search_text text
  generated always as (lower(title || ' ' || coalesce(author_name, ''))) stored;
alter table public.chains add column search_text text
  generated always as (lower(title || ' ' || coalesce(author_name, ''))) stored;

-- Only visible rows are searched (the gallery always filters hidden = false).
create index puzzles_search_idx on public.puzzles using gin (search_text extensions.gin_trgm_ops) where not hidden;
create index chains_search_idx on public.chains using gin (search_text extensions.gin_trgm_ops) where not hidden;

-- The author's name on insert (publish_puzzle, publish_chain) and if the author ever changed.
create function public.set_author_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.author_name := (select pr.username from public.profiles pr where pr.id = new.author_id);
  return new;
end;
$$;

create trigger puzzles_author_name before insert or update of author_id on public.puzzles
  for each row execute function public.set_author_name();
create trigger chains_author_name before insert or update of author_id on public.chains
  for each row execute function public.set_author_name();

-- A renamed user (also renamed by a moderator, 0007_moderation.sql) is found under the new name.
create function public.sync_author_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.puzzles set author_name = new.username where author_id = new.id;
  update public.chains set author_name = new.username where author_id = new.id;
  return null;
end;
$$;

create trigger profiles_author_name after update of username on public.profiles
  for each row when (old.username is distinct from new.username) execute function public.sync_author_name();

revoke execute on function public.set_author_name, public.sync_author_name from public, anon, authenticated;
