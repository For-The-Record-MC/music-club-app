-- v2: precise meeting time so meetings can go on calendars.
-- Adds cycles.meeting_at (timestamptz). meeting_time_location is repurposed as
-- the free-text location only. Legacy meeting_date is kept but no longer written.

alter table public.cycles add column meeting_at timestamptz;

-- Backfill from the old date column (midnight of that day) so existing meetings
-- still show.
update public.cycles
set meeting_at = meeting_date::timestamptz
where meeting_at is null and meeting_date is not null;
