-- M9: accounts. Apply after 0001_init.sql (dev first): Dashboard → SQL Editor → paste → Run.

-- Sign-up fails with a generic error when the username is taken (the profile trigger hits the unique index),
-- so the app asks first. Case-insensitive like the index.
create function public.username_available(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

-- Deletes the caller's account. Cascades remove the profile, published puzzles, likes, ratings and reports;
-- the counters of other puzzles follow via the triggers. Sessions of the user are removed with the auth user.
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.username_available, public.delete_account from public, anon, authenticated;
grant execute on function public.username_available to anon, authenticated;
grant execute on function public.delete_account to authenticated;
