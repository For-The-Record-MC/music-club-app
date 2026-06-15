-- The album a profile picture came from is shown on the profile as "Album —
-- Artist" (avatar_label); store its store/streaming link too, so that card can
-- be tapped to open the album. null when the avatar is a color.
alter table public.profiles
  add column avatar_album_url text
    check (avatar_album_url is null or char_length(avatar_album_url) <= 500);
