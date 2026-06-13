import { Linking } from 'react-native';

// Opens a Google Calendar "create event" template in the browser — works on
// web and mobile without calendar permissions. Assumes a 2-hour meeting.
export function addToCalendar(opts: {
  title: string;
  start: Date;
  location?: string | null;
  details?: string;
}) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(opts.start.getTime() + 2 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates: `${fmt(opts.start)}/${fmt(end)}`,
  });
  if (opts.location) params.set('location', opts.location);
  if (opts.details) params.set('details', opts.details);
  Linking.openURL(`https://calendar.google.com/calendar/render?${params.toString()}`);
}
