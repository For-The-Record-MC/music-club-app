-- Profile pictures: an optional avatar image URL. Members pick an album in the
-- app and we store its cover-art URL here (external CDN link, same pattern as
-- albums.artwork_url — no upload). null = fall back to initials + avatar_color.
alter table public.profiles
  add column avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500);
