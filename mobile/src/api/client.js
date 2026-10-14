/**
 * 云端图录 API 客户端。
 *
 * 纯 ESM + 原生 fetch，不 import react-native，所以同一份代码能在 Node 里跑单测，
 * 也能被 RN 页面直接 import（设计文档 §5.2：网络层重写，解析层复用）。
 */

export const DEFAULT_SERVER_URL = 'https://127.0.0.1:8444';

export class ApiError extends Error {
  constructor(message, { status = 0, url = '', cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    if (cause) this.cause = cause;
  }
}

/** 用户手输的地址可能没写协议、带尾斜杠或带 query，这里统一成 https://host:port */
export function normalizeServerUrl(input, fallback = DEFAULT_SERVER_URL) {
  let value = String(input ?? '').trim();
  if (!value) return fallback;
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
  value = value.replace(/[?#].*$/, '');
  return value.replace(/\/+$/, '');
}

/** 接口给的是 /img/t/xxx.webp 这种相对路径，RN 的 Image 需要绝对地址 */
export function buildImageUrl(serverUrl, imagePath) {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  return normalizeServerUrl(serverUrl) + (imagePath.startsWith('/') ? imagePath : '/' + imagePath);
}

export function createApiClient({
  serverUrl = DEFAULT_SERVER_URL,
  fetchImpl,
  timeoutMs = 15000,
} = {}) {
  const baseUrl = normalizeServerUrl(serverUrl);
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('createApiClient 需要一个 fetch 实现');

  async function request(path, { timeout = timeoutMs } = {}) {
    const url = baseUrl + (path.startsWith('/') ? path : '/' + path);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller && timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
    let response;
    try {
      response = await doFetch(url, {
        headers: { accept: 'application/json' },
        signal: controller ? controller.signal : undefined,
      });
    } catch (error) {
      throw new ApiError('网络请求失败：' + (error?.message || error), { url, cause: error });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!response.ok) throw new ApiError('服务返回 ' + response.status, { status: response.status, url });
    try {
      return await response.json();
    } catch (error) {
      throw new ApiError('返回内容不是合法 JSON', { status: response.status, url, cause: error });
    }
  }

  return {
    baseUrl,
    request,
    imageUrl: (path) => buildImageUrl(baseUrl, path),
    getIndex: () => request('/api/catalog/index'),
    getCategories: () => request('/api/catalog/categories'),
    getEntry: (key) => request('/api/catalog/entry?key=' + encodeURIComponent(key)),
    listEntries: ({ category = '', q = '', page = 1, limit = 30 } = {}) => {
      const search = new URLSearchParams();
      if (category) search.set('category', category);
      if (q) search.set('q', q);
      search.set('page', String(page));
      search.set('limit', String(limit));
      return request('/api/catalog/entries?' + search.toString());
    },
  };
}
