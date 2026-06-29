-- v5 Phase 1: push-notification delivery pipeline.
-- Decision #15 always intended push to ride the existing activity_events table
-- ("same events table can feed it later"). This adds the *delivery* plumbing —
-- no new event types: every row inserted into activity_events now fans out to an
-- Edge Function (send-push) which resolves recipients and calls the Expo Push API.
--
-- New: push_tokens (a member's Expo token per device platform),
-- notification_preferences (per-category opt in/out), a per-club mute flag on the
-- membership row, and an AFTER INSERT trigger on activity_events that POSTs the
-- new event's id to send-push via pg_net. Web has no Expo token, so it simply
-- never registers one and stays bell-only.

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

-- Expo push tokens, one row per (member, platform). 'web' is intentionally not a
-- valid platform — web export can't get an Expo push token, so it never inserts.
create table public.push_tokens (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  token text not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, platform)
);

create index push_tokens_token_idx on public.push_tokens (token);

-- Per-member category switches. An ABSENT row means "all defaults" — send-push
-- coalesces missing rows/columns to these same defaults, so members never need a
-- row until they change something. Mentions/lifecycle/announcements default ON;
-- the noisier social category (feed posts, concerts) defaults OFF (opt-in).
create table public.notification_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  mentions boolean not null default true,
  lifecycle boolean not null default true,
  social boolean not null default false,
  announcements boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Per-club mute: silences ALL push for one club without touching category prefs.
-- Lives on the membership row (already 1:1 with the member-in-club relationship).
alter table public.club_members
  add column notifications_muted boolean not null default false;

-- ═══════════════════════════════════════════════════════
-- RLS — both tables are strictly own-row.
-- ═══════════════════════════════════════════════════════

alter table public.push_tokens enable row level security;
alter table public.notification_preferences enable row level security;

create policy push_tokens_select on public.push_tokens
  for select to authenticated using (profile_id = auth.uid());
create policy push_tokens_insert on public.push_tokens
  for insert to authenticated with check (profile_id = auth.uid());
create policy push_tokens_update on public.push_tokens
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy push_tokens_delete on public.push_tokens
  for delete to authenticated using (profile_id = auth.uid());

create policy notification_preferences_select on public.notification_preferences
  for select to authenticated using (profile_id = auth.uid());
create policy notification_preferences_insert on public.notification_preferences
  for insert to authenticated with check (profile_id = auth.uid());
create policy notification_preferences_update on public.notification_preferences
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ═══════════════════════════════════════════════════════
-- FAN-OUT TRIGGER — activity_events insert → send-push Edge Function.
-- ═══════════════════════════════════════════════════════

create extension if not exists pg_net;

-- The function URL + a shared secret live in Vault (set manually, out of git):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'send_push_url');
--   select vault.create_secret('<random-secret>', 'send_push_secret');
-- send-push reads the same secret from its PUSH_SHARED_SECRET env var and rejects
-- callers without it. If either secret is missing (e.g. local/dev), the trigger
-- is a silent no-op so inserts never fail on account of push.
-- IMPORTANT: this fires inside the lifecycle RPCs (spin/schedule/reveal/close)
-- that insert activity_events. It must FAIL OPEN — any error here (vault/pg_net
-- unavailable, network) is swallowed so a push hiccup can never roll back a core
-- action. Worst case: a missed push, never a broken spin.
create or replace function public.notify_send_push()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'send_push_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'send_push_secret';
    if v_url is null or v_secret is null then
      return new;  -- push not configured → no-op
    end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('event_id', new.id)
    );
  exception when others then
    -- swallow: never let push delivery break the inserting transaction
    null;
  end;
  return new;
end;
$$;

create trigger activity_events_push
  after insert on public.activity_events
  for each row execute function public.notify_send_push();
