-- Optional video-call link for a cycle's meeting (Google Meet, Zoom, anything).
-- Generation stays manual (paste a link / use meet.new) — no Google OAuth.
alter table public.cycles add column meeting_url text;
