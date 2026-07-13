import { useEffect, useRef } from 'react';

// Debounce + stale-guard for search type-aheads. Every keystroke used to fire
// an API call — against Spotify's shared hourly budget (context/spotify-api.md)
// that was a quota hemorrhage: three people filling bingo cards could exhaust
// it. The fetch now fires once typing pauses; results from a superseded
// keystroke never land.
export function useDebouncedSearch(delayMs = 400) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Drop pending and in-flight work (input cleared or below min length). */
  const cancel = () => {
    seq.current++;
    if (timer.current) clearTimeout(timer.current);
  };

  /** Run `work` after the pause. `isCurrent()` is false once a newer keystroke
   * has scheduled — check it before applying results. */
  const schedule = (work: (isCurrent: () => boolean) => void | Promise<void>) => {
    const s = ++seq.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void work(() => s === seq.current), delayMs);
  };

  return { schedule, cancel };
}
