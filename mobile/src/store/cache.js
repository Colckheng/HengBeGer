/**
 * 索引与条目详情的本地缓存（设计文档 §5.5：启动先用缓存、后台刷新）。
 * 只依赖一个异步 key-value 接口，Node 单测用 Map 实现，App 里用 expo-sqlite 实现。
 */

export const INDEX_KEY = 'hb:index';
export const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
export const entryCacheKey = (key) => 'hb:entry:' + key;

/**
 * @typedef {object} KvStorage
 * @property {(key: string) => Promise<string | null>} getItem
 * @property {(key: string, value: string) => Promise<void>} setItem
 * @property {() => Promise<string[]>} getAllKeys
 * @property {(keys: string[]) => Promise<void>} multiRemove
 */

/**
 * @param {{ storage: KvStorage, now?: () => number, ttlMs?: number }} options
 */
export function createCache({ storage, now = Date.now, ttlMs = INDEX_TTL_MS } = {}) {
  if (!storage) throw new Error('createCache 需要 storage');

  async function readIndex() {
    const raw = await storage.getItem(INDEX_KEY);
    if (!raw) return { data: null, savedAt: 0, stale: true };
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { return { data: null, savedAt: 0, stale: true }; }
    const savedAt = Number(parsed && parsed.savedAt) || 0;
    return { data: (parsed && parsed.data) || null, savedAt, stale: !savedAt || now() - savedAt > ttlMs };
  }

  async function writeIndex(index, at = now()) {
    await storage.setItem(INDEX_KEY, JSON.stringify({ savedAt: at, data: index }));
    return at;
  }

  async function readEntry(key) {
    const raw = await storage.getItem(entryCacheKey(key));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return { data: parsed.data, savedAt: Number(parsed.savedAt) || 0 };
    } catch { return null; }
  }

  async function writeEntry(key, entry, at = now()) {
    await storage.setItem(entryCacheKey(key), JSON.stringify({ savedAt: at, data: entry }));
    return at;
  }

  async function listCachedEntries() {
    const keys = (await storage.getAllKeys()).filter((k) => k.startsWith('hb:entry:'));
    return keys.map((k) => k.slice('hb:entry:'.length));
  }

  async function clear() {
    const keys = await storage.getAllKeys();
    const mine = keys.filter((k) => k === INDEX_KEY || k.startsWith('hb:entry:'));
    if (mine.length) await storage.multiRemove(mine);
    return mine.length;
  }

  return { readIndex, writeIndex, readEntry, writeEntry, listCachedEntries, clear, ttlMs };
}
