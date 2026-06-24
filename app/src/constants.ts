// Public URL of the deployed web app (GitHub Pages) — used to build shareable
// invite links that work for people without the native app.
export const WEB_BASE_URL = 'https://for-the-record-mc.github.io/music-club-app';

export function inviteUrl(code: string): string {
  return `${WEB_BASE_URL}/join/${code}`;
}
