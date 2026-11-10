-- M32: Previews on the cards. The gallery, chain steps and the puzzle of the day draw the starting position of a
-- puzzle, so they need its data, but not whole documents: a quiz (no board) can be up to 128 KB of text.
-- preview_data is a computed field (PostgREST: select=preview:preview_data) that returns only what a preview needs,
-- and null for types without a board and for unusually large data. The client validates it like any document.
--
-- Types without a board: those without themeRoles in their rules.ts (src/puzzles/rules.test.ts keeps the list equal).
-- 16 KB is far above the largest board (a 14×14 ice puzzle is about 4 KB of JSON).

create function public.preview_data(p public.puzzles) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select case
    when p.type <> all (array['quiz']) and octet_length((p.doc -> 'data')::text) <= 16384
      then jsonb_build_object('typeVersion', p.type_version, 'data', p.doc -> 'data')
  end;
$$;

revoke execute on function public.preview_data from public;
grant execute on function public.preview_data to anon, authenticated;
