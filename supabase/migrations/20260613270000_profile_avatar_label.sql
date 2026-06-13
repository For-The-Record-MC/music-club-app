-- Remember which album a profile picture came from, so the profile editor can
-- show "Album — Artist" under the avatar. null when the avatar is a color.
alter table public.profiles
  add column avatar_label text check (avatar_label is null or char_length(avatar_label) <= 200);
