-- M49: The gallery card of a room may show a picture built from parts ({ "compose": { wall, floor, ceiling, left?,
-- right?, items } }, src/rooms/compose.ts). With up to 16 items that is about 1 KB instead of the 200 bytes of
-- { "builtin": … } and { "key": … }. Only the limit changes; the publish function checks the content.
-- Apply after 0018_sync_rooms.sql (dev first): Dashboard → SQL Editor → paste → Run.

alter table public.rooms drop constraint rooms_cover_check;
alter table public.rooms add constraint rooms_cover_check
  check (jsonb_typeof(cover) = 'object' and pg_column_size(cover) <= 4096);
