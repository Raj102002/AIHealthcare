// In-memory TTL cache for expensive AI calls (Production Engineering — Caching
// strategy; Agentic AI & RAG — "include caching... for failed retrievals" was
// the spec's phrasing, but the more valuable target turned out to be caching
// successful, repeated/identical retrieval and TTS calls, which is what this
// actually does).
//
// Same limitation as lib/rate-limit.ts and lib/metrics.ts's token-budget
// tracker: this lives in one warm Netlify function instance's memory, not a
// shared store — a cold start or a different concurrent instance won't see
// another instance's cached entries. That's a real ceiling on how much this
// saves in production, not a flaw to silently work around: the correct
// production upgrade is Upstash Redis (already the vector-store provider for
// this project, so no new vendor relationship, just a new database within
// it) — not implemented here because it needs a Redis REST URL/token this
// project doesn't have credentials for. See docs/deployment.md.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  if (store.size > 5000) {
    // Cheap bound so a long-lived warm instance can't grow this unboundedly —
    // evict the oldest-inserted entry. Not LRU, just a safety valve.
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Wraps an async computation: returns the cached value if present and fresh,
// otherwise computes, caches, and returns it.
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  cacheSet(key, value, ttlMs);
  return value;
}

export function cacheKeyFromText(text: string): string {
  // A simple, fast, non-cryptographic hash is enough here — this is a cache
  // key, not a security boundary.
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `${hash}:${text.length}`;
}
