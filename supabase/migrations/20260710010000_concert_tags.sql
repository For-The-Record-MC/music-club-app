-- Concert tags: members explicitly tagged on a concert ("you'd want to see
-- this"). Shown on the card; each tagged member also gets a targeted
-- mention-category notification (payload context 'concert_tag') via the
-- existing notify_comment_mentions RPC at post time. Tags are club-scoped
-- member ids, so cross-club concert copies deliberately don't carry them.
alter table public.concerts
  add column if not exists tagged_ids uuid[] not null default '{}';
