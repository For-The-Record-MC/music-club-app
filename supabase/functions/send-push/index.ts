// send-push — fans an activity_events row out to the Expo Push API.
//
// Invoked by the activity_events AFTER INSERT trigger (notify_send_push) via
// pg_net, NOT by the client. Auth is a shared secret (x-push-secret) that must
// match PUSH_SHARED_SECRET — there is no user JWT here. Flow:
//   1. validate the secret + load the event (service role, bypassing RLS)
//   2. build OS title/body/category via _shared/pushTemplate (null → skip)
//   3. resolve recipients:
//        targeted (recipient_id set) → that member only
//        broadcast → all club members minus the actor, minus club-muted,
//                    minus anyone whose category pref is off (absent row = defaults)
//   4. collect their push_tokens, POST to Expo in batches of 100
//   5. prune tokens Expo reports as DeviceNotRegistered
//
// Returns 200 always (it's a fire-and-forget webhook); the body reports counts /
// reason so logs are useful.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { pushTemplate, type Category } from '../_shared/pushTemplate.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const EXPO_URL = 'https://exp.host/--/api/v2/push/send'

// Defaults for members with no notification_preferences row (or a NULL column):
// mentions/lifecycle/announcements on, social off. Mirrors the table defaults.
const PREF_DEFAULTS: Record<Category, boolean> = {
  mentions: true,
  lifecycle: true,
  social: false,
  announcements: true,
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const SHARED_SECRET = Deno.env.get('PUSH_SHARED_SECRET')
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SHARED_SECRET) {
      return json({ ok: false, message: 'Function is missing required secrets' }, 500)
    }
    if (req.headers.get('x-push-secret') !== SHARED_SECRET) {
      return json({ ok: false, message: 'Forbidden' }, 403)
    }

    let eventId = ''
    try {
      const body = await req.json()
      eventId = String(body?.event_id ?? '').trim()
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }
    if (!eventId) return json({ ok: false, message: 'event_id is required' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // ── Load the event + actor name + club name ────────────────────────────────
    const { data: event } = await admin
      .from('activity_events')
      .select('id, club_id, actor_id, recipient_id, event_type, payload, clubs(name), profiles:profiles!activity_events_actor_id_fkey(display_name)')
      .eq('id', eventId)
      .maybeSingle()
    if (!event) return json({ ok: false, message: 'Event not found' }, 404)

    const clubName = (event as any).clubs?.name ?? 'Music club'
    const actorName = (event as any).profiles?.display_name ?? null
    const content = pushTemplate(event as any, actorName, clubName)
    if (!content) return json({ ok: true, skipped: 'no_template' })

    // ── Resolve recipient profile ids ──────────────────────────────────────────
    let recipientIds: string[] = []
    if (event.recipient_id) {
      // Targeted: just that member (never the actor).
      if (event.recipient_id !== event.actor_id) recipientIds = [event.recipient_id]
    } else {
      // Broadcast: club members minus the actor, minus club-muted.
      const { data: members } = await admin
        .from('club_members')
        .select('profile_id, notifications_muted')
        .eq('club_id', event.club_id)
      recipientIds = (members ?? [])
        .filter((m: any) => !m.notifications_muted && m.profile_id !== event.actor_id)
        .map((m: any) => m.profile_id)
    }
    if (recipientIds.length === 0) return json({ ok: true, recipients: 0, reason: 'no_recipients' })

    // ── Filter by the event's category preference ──────────────────────────────
    const { data: prefs } = await admin
      .from('notification_preferences')
      .select('profile_id, mentions, lifecycle, social, announcements')
      .in('profile_id', recipientIds)
    const prefByProfile = new Map<string, any>((prefs ?? []).map((r: any) => [r.profile_id, r]))
    const wanted = recipientIds.filter((pid) => {
      const row = prefByProfile.get(pid)
      const val = row?.[content.category]
      return val ?? PREF_DEFAULTS[content.category]
    })
    if (wanted.length === 0) return json({ ok: true, recipients: 0, reason: 'all_opted_out' })

    // ── Collect Expo tokens ────────────────────────────────────────────────────
    const { data: tokens } = await admin
      .from('push_tokens')
      .select('profile_id, token')
      .in('profile_id', wanted)
    const tokenRows = (tokens ?? []) as { profile_id: string; token: string }[]
    if (tokenRows.length === 0) return json({ ok: true, recipients: wanted.length, sent: 0, reason: 'no_tokens' })

    const data = { event_id: event.id, club_id: event.club_id, target: content.target }
    const messages = tokenRows.map((t) => ({
      to: t.token,
      title: content.title,
      body: content.body,
      sound: 'default',
      data,
    }))

    // ── Send in batches; prune dead tokens ─────────────────────────────────────
    const deadTokens: string[] = []
    let sent = 0
    for (const batch of chunk(messages, 100)) {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      })
      const out = await res.json().catch(() => null)
      const tickets: any[] = out?.data ?? []
      tickets.forEach((ticket, i) => {
        if (ticket?.status === 'ok') {
          sent++
        } else if (ticket?.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(batch[i].to)
        }
      })
    }
    if (deadTokens.length > 0) {
      await admin.from('push_tokens').delete().in('token', deadTokens)
    }

    return json({ ok: true, recipients: wanted.length, sent, pruned: deadTokens.length })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})
