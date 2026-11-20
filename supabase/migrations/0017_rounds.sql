-- M47: Playing an escape room together. A round belongs to a published room; one signed-in player starts it, the
-- others join with its code, without an account. Each player has a secret token (only its SHA-256 is stored).
-- The round's state is the union of what the players solved (switches, puzzles, locks, victory; src/rooms/group.ts).
-- Events are checked by the Edge Function "round" (src/server/round-handler.ts) against the room's document and
-- stored with round_merge(); the app polls round_state() with its token every few seconds.
-- No table is readable or writable by clients: everything goes through the functions below.
-- Rounds can be joined and played for 24 hours; cleanup_rounds() (called daily by cleanup-images) deletes them after two days.
-- Apply after 0016_rooms.sql (dev first): Dashboard → SQL Editor → paste → Run.

create table public.room_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  flags text[] not null default '{}',
  solved text[] not null default '{}',
  opened text[] not null default '{}',
  won_at timestamptz,
  event_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index room_rounds_host_idx on public.room_rounds (host_id, created_at);
create index room_rounds_created_idx on public.room_rounds (created_at);

create table public.room_round_players (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.room_rounds (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(name) between 1 and 24),
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

create index room_round_players_round_idx on public.room_round_players (round_id);

create table public.room_round_news (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.room_rounds (id) on delete cascade,
  player_id uuid references public.room_round_players (id) on delete set null,
  kind text not null check (kind in ('solved', 'opened', 'won')),
  target text not null check (char_length(target) <= 64),
  at timestamptz not null default now()
);

create index room_round_news_round_idx on public.room_round_news (round_id, id);

alter table public.room_rounds enable row level security;
alter table public.room_round_players enable row level security;
alter table public.room_round_news enable row level security;
revoke all on public.room_rounds, public.room_round_players, public.room_round_news from anon, authenticated;

-- For the Edge Function (service role) --------------------------------------------------------------------

-- Starts a round with its host as the first player. GROUP.perDay in src/rooms/group.ts.
create function public.round_create(host uuid, room uuid, round_code text, token_hash text, player_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = host and not p.banned) then
    raise exception 'unknown or banned user' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.rooms r where r.id = room and not r.hidden) then
    raise exception 'no such room' using errcode = 'PT404';
  end if;
  if (select count(*) from public.room_rounds r where r.host_id = host and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'daily limit reached' using errcode = 'PT429';
  end if;
  -- A code in use: unique violation 23505; the function tries another one.
  insert into public.room_rounds (room_id, host_id, code) values (room, host, round_code) returning id into new_id;
  insert into public.room_round_players (round_id, token_hash, name) values (new_id, round_create.token_hash, player_name);
  return new_id;
end;
$$;

-- Joins a round that is not over and not full (GROUP.maxPlayers). Returns the round and its room.
create function public.round_join(round_code text, token_hash text, player_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.room_rounds;
begin
  select * into r from public.room_rounds where code = round_code for update;
  if not found then raise exception 'no such round' using errcode = 'PT404'; end if;
  if r.created_at < now() - interval '24 hours' then raise exception 'round is over' using errcode = 'PT410'; end if;
  if (select count(*) from public.room_round_players p where p.round_id = r.id) >= 8 then
    raise exception 'round is full' using errcode = 'PT409';
  end if;
  insert into public.room_round_players (round_id, token_hash, name) values (r.id, round_join.token_hash, player_name);
  return jsonb_build_object('round', r.id, 'room', r.room_id);
end;
$$;

-- The round of a player's token, for checking events: its room and state.
create function public.round_of_player(token_hash text) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'player', p.id, 'round', r.id, 'room', r.room_id, 'flags', to_jsonb(r.flags), 'solved', to_jsonb(r.solved),
    'opened', to_jsonb(r.opened), 'won', r.won_at is not null, 'events', r.event_count,
    'expired', r.created_at < now() - interval '24 hours'
  )
  from public.room_round_players p join public.room_rounds r on r.id = p.round_id
  where p.token_hash = round_of_player.token_hash;
$$;

-- Adds checked progress to the round (union) and what the others are told. Returns the round's new state.
create function public.round_merge(
  player uuid,
  add_flags text[],
  add_solved text[],
  add_opened text[],
  add_won boolean,
  add_news jsonb,
  event_total integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.room_rounds;
begin
  select rr.* into r from public.room_rounds rr join public.room_round_players p on p.round_id = rr.id
    where p.id = player for update of rr;
  if not found then raise exception 'no such player' using errcode = 'PT404'; end if;
  if r.event_count + event_total > 1000 then raise exception 'too many events' using errcode = 'PT429'; end if;
  update public.room_rounds set
    flags = array(select distinct x from unnest(r.flags || add_flags) x order by x),
    solved = array(select distinct x from unnest(r.solved || add_solved) x order by x),
    opened = array(select distinct x from unnest(r.opened || add_opened) x order by x),
    won_at = coalesce(r.won_at, case when add_won then now() end),
    event_count = r.event_count + event_total
  where id = r.id
  returning * into r;
  insert into public.room_round_news (round_id, player_id, kind, target)
    select r.id, player, n->>'kind', coalesce(n->>'target', '') from jsonb_array_elements(add_news) n;
  update public.room_round_players set seen_at = now() where id = player;
  return jsonb_build_object('flags', to_jsonb(r.flags), 'solved', to_jsonb(r.solved), 'opened', to_jsonb(r.opened), 'won', r.won_at is not null);
end;
$$;

-- Called once a day by cleanup-images.
create function public.cleanup_rounds() returns integer
language sql security definer set search_path = '' as $$
  with gone as (delete from public.room_rounds where created_at < now() - interval '2 days' returning 1)
  select count(*)::integer from gone;
$$;

-- For the app, with the player's token --------------------------------------------------------------------

-- The round as this player sees it: state, players and the news after `since`. Null if the token is unknown (left, or
-- the round is gone). Also marks the player as present.
create function public.round_state(token text, since bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.room_round_players;
  r public.room_rounds;
begin
  if token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into p from public.room_round_players x where x.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
  if not found then return null; end if;
  if p.seen_at < now() - interval '5 seconds' then
    update public.room_round_players set seen_at = now() where id = p.id;
  end if;
  select * into r from public.room_rounds where id = p.round_id;
  return jsonb_build_object(
    'round', r.id, 'room', r.room_id, 'code', r.code, 'me', p.id, 'startedAt', r.created_at, 'wonAt', r.won_at,
    'expired', r.created_at < now() - interval '24 hours',
    'flags', to_jsonb(r.flags), 'solved', to_jsonb(r.solved), 'opened', to_jsonb(r.opened),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'seenAt', x.seen_at) order by x.joined_at), '[]'::jsonb)
      from public.room_round_players x where x.round_id = r.id),
    'news', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'player', n.player_id, 'kind', n.kind, 'target', n.target) order by n.id), '[]'::jsonb)
      from (select * from public.room_round_news n where n.round_id = r.id and n.id > since order by n.id limit 50) n),
    'lastNews', (select coalesce(max(n.id), 0) from public.room_round_news n where n.round_id = r.id)
  );
end;
$$;

-- Leaving: the player is removed; their news stay without a name.
create function public.round_leave(token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.room_round_players where token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
$$;

revoke execute on function public.round_create, public.round_join, public.round_of_player, public.round_merge,
  public.cleanup_rounds, public.round_state, public.round_leave from public, anon, authenticated;
grant execute on function public.round_create, public.round_join, public.round_of_player, public.round_merge,
  public.cleanup_rounds to service_role;
grant execute on function public.round_state, public.round_leave to anon, authenticated;
