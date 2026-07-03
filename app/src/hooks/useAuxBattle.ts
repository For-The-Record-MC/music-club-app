import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import { auxBattle, type AuxBattle, type AuxBattleSong } from '@/utils/supabase/db';

type Combatant = { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;

// The cycle's Aux Battle (not blind): both combatants, their songs, every vote.
// null when the picker hasn't started one.
export interface AuxBattleView extends AuxBattle {
  a: Combatant;
  b: Combatant;
  aux_battle_songs: AuxBattleSong[];
  aux_battle_votes: { profile_id: string; choice: string }[];
}

// Stale-while-revalidate cache keyed by cycle id — see useFeed for the pattern.
const cache = registerCache(new Map<string, AuxBattleView[]>());

export function useAuxBattle(cycleId: string | undefined) {
  const [battles, setBattles] = useState<AuxBattleView[]>(() => (cycleId ? cache.get(cycleId) : undefined) ?? []);
  const [loading, setLoading] = useState(() => !(cycleId && cache.has(cycleId)));

  const refresh = useCallback(async () => {
    if (!cycleId) {
      setBattles([]);
      setLoading(false);
      return;
    }
    const { data } = await auxBattle.forCycle(cycleId);
    const rows = (data ?? []) as AuxBattleView[];
    cache.set(cycleId, rows);
    setBattles(rows);
    setLoading(false);
  }, [cycleId]);

  // On mount or cycle change: serve the cached rows immediately and revalidate;
  // only show the record when this cycle has never been loaded.
  useEffect(() => {
    setBattles((cycleId ? cache.get(cycleId) : undefined) ?? []);
    setLoading(!(cycleId && cache.has(cycleId)));
    refresh();
  }, [cycleId, refresh]);

  return { battles, loading, refresh };
}
