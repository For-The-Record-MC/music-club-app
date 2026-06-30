import { useCallback, useEffect, useState } from 'react';

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

export function useAuxBattle(cycleId: string | undefined) {
  const [battles, setBattles] = useState<AuxBattleView[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!cycleId) {
      setBattles([]);
      setLoading(false);
      return;
    }
    const { data } = await auxBattle.forCycle(cycleId);
    setBattles((data ?? []) as AuxBattleView[]);
    setLoading(false);
  }, [cycleId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { battles, loading, refresh };
}
