// 全局单例：服务器地址来自设置（默认 DEFAULT_SERVER_URL），缓存由 SQLite 提供。
import { createApiClient, DEFAULT_SERVER_URL } from '../src/api/client';
import { createCache } from '../src/store/cache';
import { createLibrary } from '../src/store/library';
import { openSqliteStorage } from '../src/store/sqlite';

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
