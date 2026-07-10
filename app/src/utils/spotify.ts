// Spotify track search — the Spotify counterpart to utils/itunes.ts. Spotify's
// API needs a token, so unlike iTunes we can't fetch it directly from the client;
// instead we call the `spotify-search` Edge Function, which holds the app
// credentials and proxies the search (client-credentials flow, no user login).
//
// Shape mirrors ItunesSong so the feed composer can treat both sources alike,
// plus a `uri` (spotify:track:<id>) that the per-cycle playlist sync needs later.

import { supabase } from './supabase/client';

export interface SpotifySong {
  id: string;
  uri: string; // spotify:track:<id>
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl: string;
  spotifyUrl: string;
  // Track length — Listening Bingo's listen gate. Nullable: an older deployed
  // spotify-search omits it (callers fall back to a fixed-time gate).
  durationMs?: number | null;
  // Recording code for exact Apple Music matching. Nullable for the same reason.
  isrc?: string | null;
}

export interface SpotifyAlbum {
  id: string;
  uri: string; // spotify:album:<id>
  collectionName: string;
  artistName: string;
  artworkUrl: string;
  spotifyUrl: string;
  year: number | null;
}

export interface SpotifyArtist {
  id: string;
  uri: string; // spotify:artist:<id>
  name: string;
  imageUrl: string;
  spotifyUrl: string;
}

interface SearchResponse<T> {
  results?: T[];
  ok?: false;
  message?: string;
}

export async function searchSongs(term: string): Promise<SpotifySong[]> {
  const q = term.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke<SearchResponse<SpotifySong>>(
    'spotify-search',
    { body: { term: q } },
  );
  if (error || !data || data.ok === false) return [];
  return data.results ?? [];
}

export async function searchAlbums(term: string): Promise<SpotifyAlbum[]> {
  const q = term.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke<SearchResponse<SpotifyAlbum>>(
    'spotify-search',
    { body: { term: q, type: 'album' } },
  );
  if (error || !data || data.ok === false) return [];
  // Guard against an un-deployed function (which ignores type and returns
  // track-shaped rows with no collectionName) — callers then fall back to iTunes.
  return (data.results ?? []).filter((a) => a.collectionName);
}

// Artist search for the Convince Me composer. Spotify-only (the iTunes Search
// API has no artist entity with a usable photo); returns [] on any failure so
// the composer can fall back to a free-typed artist name.
export async function searchArtists(term: string): Promise<SpotifyArtist[]> {
  const q = term.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke<SearchResponse<SpotifyArtist>>(
    'spotify-search',
    { body: { term: q, type: 'artist' } },
  );
  if (error || !data || data.ok === false) return [];
  // An un-deployed function ignores type and returns track-shaped rows (no
  // `name`); filter those out so we don't show garbage.
  return (data.results ?? []).filter((a) => a.name);
}

// The Spotify equivalent of an item already picked from iTunes — used to attach
// a Spotify link to a feed post / album when the club is connected. Best-effort:
// returns null (caller just skips the Spotify link) when nothing matches.
export interface SpotifyMatch {
  url: string;
  uri: string;
}

export async function resolveSpotifyTrack(
  title: string,
  artist: string,
): Promise<SpotifyMatch | null> {
  const term = [title, artist].filter(Boolean).join(' ').trim();
  const hit = (await searchSongs(term))[0];
  return hit?.spotifyUrl ? { url: hit.spotifyUrl, uri: hit.uri } : null;
}

export async function resolveSpotifyAlbum(
  title: string,
  artist: string,
): Promise<SpotifyMatch | null> {
  const term = [title, artist].filter(Boolean).join(' ').trim();
  const hit = (await searchAlbums(term))[0];
  return hit?.spotifyUrl ? { url: hit.spotifyUrl, uri: hit.uri } : null;
}
