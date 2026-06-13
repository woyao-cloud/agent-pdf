import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, string>({
  max: 500,
  ttl: 5 * 60 * 1000,
});

export function get(key: string): string | undefined {
  return cache.get(key);
}

export function set(key: string, value: string): void {
  cache.set(key, value);
}

export function has(key: string): boolean {
  return cache.has(key);
}

export function clear(): void {
  cache.clear();
}