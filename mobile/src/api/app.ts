// 全局单例：服务器地址来自设置（默认 DEFAULT_SERVER_URL），缓存由 SQLite 提供。
// 注意：这个文件不能放在 app/ 下 —— expo-router 会把 app/ 里的每个文件当成路由页面，
// 放在 app/ 下会报 'Route "./_client.ts" is missing the required default export'。
import { createApiClient, DEFAULT_SERVER_URL } from './client';
import { createCache } from '../store/cache';
import { createLibrary } from '../store/library';
import { openSqliteStorage } from '../store/sqlite';

let ready: Promise<{
  client: ReturnType<typeof createApiClient>;
  cache: ReturnType<typeof createCache>;
  library: ReturnType<typeof createLibrary>;
  storage: Awaited<ReturnType<typeof openSqliteStorage>>;
}> | null = null;

export function getApp() {
  if (!ready) {
    ready = (async () => {
      const storage = await openSqliteStorage();
      const saved = await storage.getItem('hb:serverUrl');
      const client = createApiClient({ serverUrl: saved || DEFAULT_SERVER_URL });
      return { client, cache: createCache({ storage }), library: createLibrary({ storage }), storage };
    })();
  }
  return ready;
}