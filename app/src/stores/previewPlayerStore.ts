// Global 30s-preview player (SONG_PREVIEWS_PLAN.md). One module-level
// expo-audio player behind a zustand store: starting any preview stops the
// current one, so exactly one plays at a time app-wide. Previews are streamed
// from Apple's CDN (never cached to disk — ToS).
//
// Deliberately NOT wired to Listening Bingo's listen timer — only real
// link-outs count (locked decision).

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { AppState } from 'react-native';
import { create } from 'zustand';

interface PreviewPlayerStore {
  // Caller-chosen id of the row whose preview is playing (e.g. `bingo:<uuid>`).
  playingId: string | null;
  // 0..1 through the ~30s clip; drives the progress bar on the active button.
  progress: number;
  play: (id: string, url: string, refetch?: () => Promise<string | null>) => void;
  stop: () => void;
}

let player: AudioPlayer | null = null;
// Guards the stale-URL fallback: if a clip never starts within the window
// (mzstatic URLs occasionally rot), re-fetch a fresh URL once and retry.
let startCheck: ReturnType<typeof setTimeout> | null = null;

export const usePreviewPlayer = create<PreviewPlayerStore>((set, get) => {
  const ensurePlayer = (): AudioPlayer => {
    if (player) return player;
    // Previews should be audible with the mute switch on (like every music
    // app) and stop when the app backgrounds.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    AppState.addEventListener('change', (s) => {
      if (s !== 'active') get().stop();
    });
    player = createAudioPlayer(null, { updateInterval: 250 });
    player.addListener('playbackStatusUpdate', (status) => {
      if (!get().playingId) return;
      if (status.didJustFinish) {
        set({ playingId: null, progress: 0 });
        return;
      }
      const duration = status.duration || 30;
      set({ progress: Math.min(1, (status.currentTime ?? 0) / duration) });
    });
    return player;
  };

  const startPlayback = (url: string) => {
    const p = ensurePlayer();
    p.replace({ uri: url });
    p.seekTo(0);
    p.play();
  };

  return {
    playingId: null,
    progress: 0,

    play: (id, url, refetch) => {
      if (startCheck) clearTimeout(startCheck);
      set({ playingId: id, progress: 0 });
      startPlayback(url);
      // Never started after 4s → assume the URL rotted; one refetch attempt.
      startCheck = setTimeout(async () => {
        const current = get();
        if (current.playingId !== id || current.progress > 0 || !refetch) return;
        const fresh = await refetch().catch(() => null);
        if (fresh && get().playingId === id) startPlayback(fresh);
        else if (get().playingId === id) set({ playingId: null, progress: 0 });
      }, 4000);
    },

    stop: () => {
      if (startCheck) clearTimeout(startCheck);
      player?.pause();
      set({ playingId: null, progress: 0 });
    },
  };
});
