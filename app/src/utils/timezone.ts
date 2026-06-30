// Timezone helpers for the meeting-time poll. Slots are stored as absolute
// instants; a club picks one display timezone (clubs.meeting_timezone, an IANA
// name) and every slot is rendered in it with its short label (e.g. "EDT"), so
// everyone reads the same wall-clock regardless of their device's zone.

// The viewer's device timezone, used as the default before a club sets one.
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

// A curated picker list — common US zones first, then a few worldwide. Stored
// value is the IANA name; label is what the settings screen shows.
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain — no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'America/Toronto', label: 'Eastern — Canada (Toronto)' },
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Central Europe (Paris)' },
  { value: 'Europe/Berlin', label: 'Central Europe (Berlin)' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
];

// Human label for a stored IANA value (falls back to the raw name).
export function timezoneLabel(tz: string | null | undefined): string {
  if (!tz) return 'Device timezone';
  return COMMON_TIMEZONES.find((t) => t.value === tz)?.label ?? tz;
}

// Format an instant in the given zone with weekday/date/time + short tz label,
// e.g. "Fri, Jul 4, 7:00 PM EDT". A null/empty tz falls back to the device zone.
export function formatSlot(iso: string, tz?: string | null): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz || undefined,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
