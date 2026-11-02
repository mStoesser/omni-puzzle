-- M9: Accounts created without a username (dashboard invite, admin API) failed on the not-null constraint.
-- They now get a placeholder name that can be changed on the account page. A name sent at sign-up is still
-- used as given, so an invalid or taken one keeps failing the sign-up.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'spieler_' || left(replace(new.id::text, '-', ''), 12)
    )
  );
  return new;
end;
$$;
