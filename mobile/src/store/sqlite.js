/**
 * expo-sqlite 实现的异步 key-value，接口与 cache.js / library.js 期望的一致。
 * App 启动时 openSqliteStorage() 一次，传给 createCache / createLibrary。
 */
import * as SQLite from 'expo-sqlite';

export async function openSqliteStorage(name = 'hengbeger.db') {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync([
    'PRAGMA journal_mode = WAL;',
    'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);',
  ].join('\n'));

  return {
    async getItem(key) {
      const row = await db.getFirstAsync('SELECT value FROM kv WHERE key = ?', [key]);
      return row ? row.value : null;
    },
    async setItem(key, value) {
      await db.runAsync(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
    },
    async removeItem(key) { await db.runAsync('DELETE FROM kv WHERE key = ?', [key]); },
    async getAllKeys() {
      const rows = await db.getAllAsync('SELECT key FROM kv');
      return rows.map((row) => row.key);
    },
    async multiRemove(keys) {
      if (!keys.length) return;
      await db.withTransactionAsync(async () => {
        for (const key of keys) await db.runAsync('DELETE FROM kv WHERE key = ?', [key]);
      });
    },
  };
}
