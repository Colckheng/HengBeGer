/** 测试用的异步 key-value，与 expo-sqlite 适配器同接口。 */
export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    async getItem(key) { return map.has(key) ? map.get(key) : null; },
    async setItem(key, value) { map.set(key, String(value)); },
    async removeItem(key) { map.delete(key); },
    async getAllKeys() { return [...map.keys()]; },
    async multiRemove(keys) { for (const key of keys) map.delete(key); },
  };
}
