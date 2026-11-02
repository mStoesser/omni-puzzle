-- M12: Ratings decide the difficulty of puzzles without a solver result (quiz, or the server's search limit
-- was reached). From MIN_RATINGS (3, src/core/reactions.ts) ratings on: average < 2.5 easy, < 3.5 medium,
-- else hard (levelFromRating in src/core/difficulty.ts). Puzzles with min_moves keep their measured level.

create or replace function public.count_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  puzzle uuid := coalesce(new.puzzle_id, old.puzzle_id);
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.puzzles set rating_sum = rating_sum - old.value, rating_count = rating_count - 1
      where id = old.puzzle_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.puzzles set rating_sum = rating_sum + new.value, rating_count = rating_count + 1
      where id = new.puzzle_id;
  end if;
  -- Integer comparisons: sum / count < 2.5  ⇔  2 · sum < 5 · count.
  update public.puzzles set difficulty = case
      when rating_count < 3 then null
      when 2 * rating_sum < 5 * rating_count then 1
      when 2 * rating_sum < 7 * rating_count then 2
      else 3
    end
    where id = puzzle and min_moves is null;
  return null;
end;
$$;
