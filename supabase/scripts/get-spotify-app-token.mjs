// One-time helper: obtain a long-lived Spotify REFRESH TOKEN for the shared
// "app" account that creates playlists for every non-allowlisted club.
//
// Run this ONCE, logged into the new app Spotify account in your browser. It
// prints a refresh token; set it as the SPOTIFY_APP_REFRESH_TOKEN Edge secret:
//
//   supabase secrets set SPOTIFY_APP_REFRESH_TOKEN=<printed value>
//
// ── Setup ────────────────────────────────────────────────────────────────────
// 1. In the Spotify Developer dashboard for THIS app (same client id/secret the
//    Edge Functions use), add this Redirect URI:
//        http://127.0.0.1:8888/callback
// 2. Run with the app's client id + secret:
//        SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy \
//          node supabase/scripts/get-spotify-app-token.mjs
// 3. A browser opens to Spotify. IMPORTANT: make sure you're logged into the
//    NEW app account (use a private window if your personal account is active),
//    then click Agree.
//
// The token grant is scoped to playlist-modify-public — the same scope
// spotify-sync needs to create/own public playlists.

import http from 'node:http';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPE = 'playlist-modify-public';
const PORT = 8888;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the environment.');
  process.exit(1);
}

const state = Math.random().toString(36).slice(2);
const authUrl =
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    show_dialog: 'true',
  }).toString();

const openBrowser = (url) => {
  const cmd =
    process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  const finish = (msg) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body style="font-family:sans-serif"><h2>${msg}</h2>You can close this tab.</body></html>`);
    server.close();
  };

  if (err) { console.error('Spotify error:', err); finish('Error — check the terminal.'); process.exit(1); }
  if (!code || returnedState !== state) { finish('Bad request — check the terminal.'); process.exit(1); }

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok || !data.refresh_token) {
      console.error('Token exchange failed:', data);
      finish('Token exchange failed — check the terminal.');
      process.exit(1);
    }
    // Confirm which account we just authorized, so you don't accidentally use a
    // personal account's token.
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const me = await meRes.json().catch(() => ({}));
    console.log('\nAuthorized as:', me.display_name ?? me.id ?? '(unknown)');
    console.log('\n=== SPOTIFY_APP_REFRESH_TOKEN ===\n' + data.refresh_token + '\n');
    console.log('Set it with:\n  supabase secrets set SPOTIFY_APP_REFRESH_TOKEN=' + data.refresh_token + '\n');
    finish('Got the refresh token — check the terminal.');
  } catch (e) {
    console.error(e);
    finish('Unexpected error — check the terminal.');
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('Opening Spotify consent in your browser…');
  console.log('If it does not open, visit:\n' + authUrl + '\n');
  openBrowser(authUrl);
});
