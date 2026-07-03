// Registry for the hooks' stale-while-revalidate caches (see useFeed for the
// pattern). Caches are module singletons, so without this a relog as a
// different account could briefly flash the previous user's cached rows —
// signOut clears every registered cache.
const caches: Array<Map<string, unknown>> = [];

export function registerCache<T extends Map<string, unknown>>(cache: T): T {
  caches.push(cache);
  return cache;
}

export function clearDataCaches() {
  for (const cache of caches) cache.clear();
}
