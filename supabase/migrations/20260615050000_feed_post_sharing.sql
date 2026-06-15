-- Feed post sharing: cross-post a song/album to your other clubs.
--
-- Mirrors concert sharing (20260615040000): a share creates an independent copy
-- of the post in the target club, authored by the sharer, pointing back to the
-- original via origin_post_id (null = original). Dedupe matters more here than
-- for concerts because a duplicate track would waste a member's per-cycle song
-- slot. The original poster is credited via metadata.shared_from_* on the copy.
--
-- No new RLS or trigger work is needed:
--   * feed_posts_insert already requires author_id = auth.uid() and membership,
--     so you can only share into your own clubs, as yourself.
--   * enforce_song_limit() still fires on the copy's INSERT, so a track shared
--     into a club where the sharer is at their cap is rejected server-side —
--     the sharer's quota in the *target* club is what governs.

alter table public.feed_posts
  add column origin_post_id uuid references public.feed_posts (id) on delete set null;

comment on column public.feed_posts.origin_post_id is
  'Set on copies created by sharing a post to another club; points to the original post. Null = original.';

create index feed_posts_origin_idx on public.feed_posts (origin_post_id);
