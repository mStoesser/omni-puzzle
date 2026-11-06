-- M24: Puzzle chains. A chain is an ordered list of 2–20 visible gallery puzzles (also other authors' puzzles) with a text
-- before each puzzle and a closing text. Solving a step unlocks the next one; progress stays on the device (content_key).
-- Chains are created only by publish_chain and are immutable apart from title and description. No likes for chains.
-- Apply after 0008_images.sql (dev first): Dashboard → SQL Editor → paste → Run.

create table public.chains (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  -- [{ "puzzle": <puzzle id>, "key": <its content_key>, "text": <shown before the puzzle> }], built by publish_chain.
  -- No foreign key: a withdrawn puzzle stays in the list and is shown as "no longer available".
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 2 and 20
    and pg_column_size(steps) <= 65536),
  outro text not null default '' check (char_length(outro) <= 2000), -- shown after the last step
  hidden boolean not null default false,
  play_count integer not null default 0,
  report_count integer not null default 0,
  published_at timestamptz not null default now()
);

create index chains_author_idx on public.chains (author_id);
create index chains_published_idx on public.chains (published_at desc, id desc) where not hidden;
create index chains_plays_idx on public.chains (play_count desc, id desc) where not hidden;

-- Reports are for a puzzle or a chain. Same threshold (3 open reports hide it), one report per user and chain.
alter table public.reports alter column puzzle_id drop not null;
alter table public.reports add column chain_id uuid references public.chains (id) on delete cascade;
alter table public.reports add constraint reports_one_target check (num_nonnulls(puzzle_id, chain_id) = 1);
alter table public.reports add constraint reports_chain_id_reporter_id_key unique (chain_id, reporter_id);

create or replace function public.count_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.puzzle_id is not null then
    update public.puzzles
      set report_count = report_count + 1, hidden = hidden or report_count + 1 >= 3
      where id = new.puzzle_id;
  else
    update public.chains
      set report_count = report_count + 1, hidden = hidden or report_count + 1 >= 3
      where id = new.chain_id;
  end if;
  return null;
end;
$$;

-- Publishing -----------------------------------------------------------------------------------------
-- Called by the signed-in user (POST /rest/v1/rpc/publish_chain). Errors: HTTP status from the PTxxx code, the message is
-- a code for the app (chainErrorText in src/core/chains.ts). CHAIN in src/core/chains.ts has the same limits.

create function public.publish_chain(title text, description text, steps jsonb, outro text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  author uuid := auth.uid();
  step jsonb;
  puzzle_text text;
  puzzle_key text;
  ids uuid[] := '{}';
  clean jsonb := '[]';
  new_id uuid;
begin
  if author is null or not exists (select 1 from public.profiles p where p.id = author and not p.banned) then
    raise exception 'banned' using errcode = 'PT403';
  end if;
  if (select count(*) from public.chains c where c.author_id = author and c.published_at > now() - interval '1 day') >= 5 then
    raise exception 'daily-limit' using errcode = 'PT429';
  end if;
  title := btrim(coalesce(title, ''));
  description := btrim(coalesce(description, ''));
  outro := btrim(coalesce(outro, ''));
  if char_length(title) not between 1 and 200 then raise exception 'invalid-title' using errcode = 'PT400'; end if;
  if char_length(description) > 2000 then raise exception 'invalid-description' using errcode = 'PT400'; end if;
  if char_length(outro) > 2000 then raise exception 'invalid-outro' using errcode = 'PT400'; end if;
  if jsonb_typeof(steps) is distinct from 'array' or jsonb_array_length(steps) not between 2 and 20 then
    raise exception 'invalid-steps' using errcode = 'PT400';
  end if;

  for step in select value from jsonb_array_elements(steps) loop
    puzzle_text := case when jsonb_typeof(step) = 'object' and jsonb_typeof(step -> 'puzzle') = 'string' then step ->> 'puzzle' end;
    if puzzle_text is null or puzzle_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(jsonb_typeof(step -> 'text'), 'string') <> 'string'
      or char_length(btrim(coalesce(step ->> 'text', ''))) > 500 then
      raise exception 'invalid-steps' using errcode = 'PT400';
    end if;
    if puzzle_text::uuid = any (ids) then raise exception 'duplicate-step' using errcode = 'PT400'; end if;
    select p.content_key into puzzle_key from public.puzzles p where p.id = puzzle_text::uuid and not p.hidden;
    if puzzle_key is null then
      raise exception 'unavailable-puzzle' using errcode = 'PT400', detail = puzzle_text;
    end if;
    ids := ids || puzzle_text::uuid;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'puzzle', puzzle_text, 'key', puzzle_key, 'text', btrim(coalesce(step ->> 'text', ''))));
  end loop;

  insert into public.chains (author_id, title, description, steps, outro)
  values (author, title, description, clean, outro)
  returning id into new_id;
  return new_id;
end;
$$;

-- Counted once per device like puzzles; anonymous, deliberately not tamper-proof.
create function public.register_chain_play(chain uuid) returns void
language sql security definer set search_path = '' as $$
  update public.chains set play_count = play_count + 1 where id = chain and not hidden;
$$;

-- Moderation, like mod_release_puzzle and mod_hide_puzzle (0007_moderation.sql).
create function public.mod_release_chain(chain uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  update public.reports set resolved = true where chain_id = chain and not resolved;
  update public.chains set hidden = false, report_count = 0 where id = chain;
end;
$$;

create function public.mod_hide_chain(chain uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  update public.reports set resolved = true where chain_id = chain and not resolved;
  update public.chains set hidden = true, report_count = 0 where id = chain;
end;
$$;

-- Privileges -----------------------------------------------------------------------------------------

revoke all on public.chains from anon, authenticated;
grant select on public.chains to anon, authenticated;
grant update (title, description) on public.chains to authenticated;
grant delete on public.chains to authenticated;

revoke execute on function public.publish_chain, public.register_chain_play, public.mod_release_chain,
  public.mod_hide_chain from public, anon, authenticated;
grant execute on function public.register_chain_play to anon, authenticated;
grant execute on function public.publish_chain, public.mod_release_chain, public.mod_hide_chain to authenticated;

-- Row Level Security ---------------------------------------------------------------------------------

alter table public.chains enable row level security;

create policy "visible chains are public" on public.chains for select
  using (not hidden or author_id = (select auth.uid()) or (select public.is_moderator()));
create policy "authors edit their chains" on public.chains for update to authenticated
  using (author_id = (select auth.uid()) and (select public.is_active_user()))
  with check (author_id = (select auth.uid()));
create policy "authors and moderators delete chains" on public.chains for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_moderator()));

-- The puzzle policy from 0001 needs a puzzle; this one allows reports of visible chains of other authors.
create policy "users report chains" on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid()) and (select public.is_active_user()) and not resolved and puzzle_id is null
    and exists (select 1 from public.chains c where c.id = chain_id and not c.hidden and c.author_id <> (select auth.uid()))
  );
