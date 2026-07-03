import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import { perfectPlaylist, type PerfectPlaylist, type PerfectPlaylistSong } from '@/utils/supabase/db';

export interface PlaylistSongRow extends PerfectPlaylistSong {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
}
export interface PlaylistView extends PerfectPlaylist {
  perfect_playlist_songs: PlaylistSongRow[];
}

// The current cycle's Perfect Playlist, or null when the picker hasn't started
// one. Songs ride along with their contributor, newest-cycle scoped by cycleId.
// Stale-while-revalidate cache keyed by cycle id — see useFeed for the pattern.
const cache = registerCache(new Map<string, PlaylistView | null>());

export function usePerfectPlaylist(cycleId: string | undefined) {
  const [playlist, setPlaylist] = useState<PlaylistView | null>(() => (cycleId ? cache.get(cycleId) : undefined) ?? null);
  const [loading, setLoading] = useState(() => !(cycleId && cache.has(cycleId)));

  const refresh = useCallback(async () => {
    if (!cycleId) {
      setPlaylist(null);
      setLoading(false);
      return;
    }
    const { data } = await perfectPlaylist.forCycle(cycleId);
    const next = (data as PlaylistView | null) ?? null;
    cache.set(cycleId, next);
    setPlaylist(next);
    setLoading(false);
  }, [cycleId]);

  // On mount or cycle change: serve the cached view immediately and revalidate;
  // only show the record when this cycle has never been loaded.
  useEffect(() => {
    setPlaylist((cycleId ? cache.get(cycleId) : undefined) ?? null);
    setLoading(!(cycleId && cache.has(cycleId)));
    refresh();
  }, [cycleId, refresh]);

  return { playlist, loading, refresh };
}
