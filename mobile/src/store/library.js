/**
 * 收藏与浏览历史（设计文档 §5.5：纯本地 SQLite）。
 * 同样是 storage 注入的纯逻辑，Node 单测覆盖。
 */

export const FAVORITES_KEY = 'hb:favorites';
export const HISTORY_KEY = 'hb:history';
export const HISTORY_MAX = 100;

/**
 * @param {{ storage: import('./cache.js').KvStorage, now?: () => number, historyMax?: number }} options
 */
export function createLibrary({ storage, now = Date.now, historyMax = HISTORY_MAX } = {}) {
  if (!storage) throw new Error('createLibrary 需要 storage');

  async function readList(key) {
    const raw = await storage.getItem(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  async function writeList(key, list) {
    await storage.setItem(key, JSON.stringify(list));
    return list;
  }

  async function listFavorites() { return readList(FAVORITES_KEY); }

  async function isFavorite(key) {
    const favorites = await readList(FAVORITES_KEY);
    return favorites.some((item) => item.key === key);
  }

  async function toggleFavorite(key, label = '') {
    const favorites = await readList(FAVORITES_KEY);
    const index = favorites.findIndex((item) => item.key === key);
    let active;
    if (index >= 0) { favorites.splice(index, 1); active = false; }
    else { favorites.unshift({ key, label, at: now() }); active = true; }
    await writeList(FAVORITES_KEY, favorites);
    return { active, favorites };
  }

  async function listHistory() { return readList(HISTORY_KEY); }

  async function pushHistory(key, label = '') {
    const history = await readList(HISTORY_KEY);
    const next = [{ key, label, at: now() }, ...history.filter((item) => item.key !== key)];
    return writeList(HISTORY_KEY, next.slice(0, historyMax));
  }

  async function clearHistory() { return writeList(HISTORY_KEY, []); }

  return { listFavorites, isFavorite, toggleFavorite, listHistory, pushHistory, clearHistory };
}
