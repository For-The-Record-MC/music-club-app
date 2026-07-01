import { useCallback, useEffect, useState } from 'react';

import { feed, type FeedPost } from '@/utils/supabase/db';

export interface SuggestionRow extends FeedPost {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
}

// The Queue — album suggestions the club has floated for future picks. Same
// feed_posts table, filtered to is_album_suggestion (feed.suggestions).
export function useSuggestions(clubId: string | undefined) {
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await feed.suggestions(clubId);
    setSuggestions((data ?? []) as SuggestionRow[]);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { suggestions, loading, refresh };
}
