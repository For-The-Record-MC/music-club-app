// Spotify connect flow (owner-only). The client runs the consent step with the
// public client id, then hands the returned authorization code to the
// spotify-oauth Edge Function, which holds the secret and stores the tokens.
//
// We use the standard Authorization Code flow (no PKCE): the secret lives
// server-side in the Edge Function, so the public-client PKCE protection isn't
// needed. Works on web (popup) and native (in-app browser) via expo-web-browser.

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { streaming } from './supabase/db';

const SCOPES = 'playlist-modify-public';
const clientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID as string | undefined;

// The redirect URI for this platform/build. Show this to the owner so they can
// register the EXACT value in the Spotify dashboard (no guesswork across
// web/native/dev).
export function spotifyRedirectUri(): string {
  if (Platform.OS === 'web') {
    // expo-linking's createURL drops the expo-router baseUrl on web, which would
    // send Spotify to a path outside the deploy base (e.g. /spotify-callback
    // instead of /music-club-app/spotify-callback) — a hard GitHub Pages 404
    // that strands the auth code. Build the URL from the origin + base path.
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    return `${window.location.origin}${base}/spotify-callback`;
  }
  return Linking.createURL('spotify-callback');
}

export interface ConnectResult {
  ok: boolean;
  message?: string;
  display_name?: string;
}

export async function connectSpotify(clubId: string): Promise<ConnectResult> {
  if (!clientId) {
    return { ok: false, message: 'Spotify is not configured (missing EXPO_PUBLIC_SPOTIFY_CLIENT_ID).' };
  }
  const redirectUri = spotifyRedirectUri();
  const state = Math.random().toString(36).slice(2);
  const authUrl =
    'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      show_dialog: 'true',
    }).toString();

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== 'success' || !result.url) {
    return { ok: false, message: 'Connection cancelled.' };
  }

  const { queryParams } = Linking.parse(result.url);
  const code = queryParams?.code as string | undefined;
  const returnedState = queryParams?.state as string | undefined;
  const err = queryParams?.error as string | undefined;
  if (err) return { ok: false, message: `Spotify error: ${err}` };
  if (!code || returnedState !== state) {
    return { ok: false, message: 'No authorization code returned.' };
  }

  const { data, error } = await streaming.connect(clubId, code, redirectUri);
  if (error) return { ok: false, message: error.message };
  if (!data || data.ok === false) return { ok: false, message: data?.message ?? 'Could not save the connection.' };
  return { ok: true, display_name: data.display_name };
}
