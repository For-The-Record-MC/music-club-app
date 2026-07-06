-- Concerts keep the Ticketmaster artist image. concert-search has returned
-- imageUrl all along (shown in the type-ahead) — it was just dropped on save
-- because there was no column for it.
alter table public.concerts add column image_url text;
