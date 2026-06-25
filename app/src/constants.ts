// Public URL of the deployed web app (GitHub Pages) — used to build shareable
// invite links that work for people without the native app.
export const WEB_BASE_URL = 'https://for-the-record-mc.github.io/music-club-app';

export function inviteUrl(code: string): string {
  return `${WEB_BASE_URL}/join/${code}`;
}

// Canonical vibe-tag vocabulary. The `vibe_tags` catalog table is seeded with
// these (is_canonical = true); members may also add custom tags, which land in
// the same catalog. Kept here too so the picker can render the canonical set
// instantly without a round-trip.
export const CANONICAL_VIBE_TAGS = [
  'Cozy',
  'Sad',
  'Chaotic',
  'Late night',
  'Summer',
  'Expensive',
  'Angry',
  'Weird',
  'Romantic',
  'Nostalgic',
  'Driving',
  'Background music',
  'Headphones album',
  'Party album',
  'Grower',
  'Too long',
  'Skipless',
  'Front-loaded',
] as const;
