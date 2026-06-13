import { useCallback, useState } from 'react';

// Wraps a refresh function with the refreshing state RefreshControl needs.
// Pass the returned values straight to <Screen onRefresh refreshing>.
export function useRefresh(fn: () => Promise<unknown> | void) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fn();
    } finally {
      setRefreshing(false);
    }
  }, [fn]);
  return { refreshing, onRefresh };
}
