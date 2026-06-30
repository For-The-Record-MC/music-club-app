import { useCallback, useEffect, useState } from 'react';

import { perfectPlaylist, type PerfectPlaylist, type PerfectPlaylistSong } from '@/utils/supabase/db';

export interface PlaylistSongRow extends PerfectPlaylistSong {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
}
export interface PlaylistView extends PerfectPlaylist {
  perfect_playlist_songs: PlaylistSongRow[];
}

// The current cycle's Perfect Playlist, or null when the picker hasn't started
// one. Songs ride along with their contributor, newest-cycle scoped by cycleId.
export function usePerfectPlaylist(cycleId: string | undefined) {
  const [playlist, setPlaylist] = useState<PlaylistView | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!cycleId) {
      setPlaylist(null);
      setLoading(false);
      return;
    }
    const { data } = await perfectPlaylist.forCycle(cycleId);
    setPlaylist((data as PlaylistView | null) ?? null);
    setLoading(false);
  }, [cycleId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { playlist, loading, refresh };
}
