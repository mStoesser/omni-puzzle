-- M14: Pictures in quiz questions. A public bucket; files are written only by the Edge Function "publish"
-- (service role, no storage policies for users) at quiz-images/<puzzle id>/<key>, key = SHA-256 of the bytes.
-- Storage objects cannot be deleted per SQL; the Edge Function "cleanup-images" removes folders of deleted
-- puzzles once a day (.github/workflows/cleanup-images.yml).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-images', 'quiz-images', true, 200000, array['image/webp', 'image/jpeg']);
