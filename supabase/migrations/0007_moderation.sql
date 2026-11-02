-- M13: Moderation. Moderators (profiles.is_moderator, set only here in the SQL editor) act through these
-- functions; each one checks is_moderator() itself, so granting EXECUTE to authenticated is safe.
-- Make someone a moderator:  update public.profiles set is_moderator = true where username = '…';
--
-- puzzles.report_count now means "open reports": closing them resets it, so after a release three new
-- reports are needed to hide the puzzle again.

-- Release a hidden puzzle (or confirm a reported one is fine): visible again, its reports closed.
create function public.mod_release_puzzle(puzzle uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  update public.reports set resolved = true where puzzle_id = puzzle and not resolved;
  update public.puzzles set hidden = false, report_count = 0 where id = puzzle;
end;
$$;

-- Hide a puzzle until a moderator releases it; its reports are closed. Only its author and moderators see it.
create function public.mod_hide_puzzle(puzzle uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  update public.reports set resolved = true where puzzle_id = puzzle and not resolved;
  update public.puzzles set hidden = true, report_count = 0 where id = puzzle;
end;
$$;

-- Ban or unban a user. Moderators cannot be banned this way (remove the flag in the SQL editor first).
create function public.mod_set_banned(target uuid, ban boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  update public.profiles set banned = ban where id = target and not is_moderator;
end;
$$;

-- Replace an offensive username with the neutral placeholder also used for accounts without a name.
create function public.mod_reset_username(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  update public.profiles set username = 'spieler_' || left(replace(target::text, '-', ''), 12) where id = target;
end;
$$;

revoke execute on function public.mod_release_puzzle, public.mod_hide_puzzle, public.mod_set_banned,
  public.mod_reset_username from public, anon;
grant execute on function public.mod_release_puzzle, public.mod_hide_puzzle, public.mod_set_banned,
  public.mod_reset_username to authenticated;
