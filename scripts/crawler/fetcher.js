import axios from 'axios';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function proxyFromEnv(env = process.env) {
  const raw = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  if (!raw) return null;
  const u = new URL(raw);
  return {
    protocol: u.protocol.replace(':', ''),
    host: u.hostname,
    port: Number(u.port),
    auth: u.username ? `${u.username}:${decodeURIComponent(u.password)}` : undefined,
  };
}

export const defaultRetryDelay = (status, attempt, backoffMs) =>
  status === 567 ? Math.max(30000, backoffMs) : backoffMs * 2 ** attempt;

export function createFetcher(options = {}) {
  const {
    timeout = 15000,
    retries = 3,
    backoffMs = 1000,
    rateLimitMs = 0,
    proxy = proxyFromEnv(),
    headers = {},
    logger = null,
    retryStatus = [429, 500, 502, 503, 504, 567],
    retryDelay = defaultRetryDelay,
  } = options;

  const retrySet = new Set(retryStatus);
  const lastHit = new Map();

  async function turn(url) {
    if (!rateLimitMs) return;
    const host = new URL(url).host;
    const prev = lastHit.get(host) || 0;
    const wait = prev + rateLimitMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
  }

  async function get(url, req = {}) {
    for (let attempt = 0; ; attempt += 1) {
      await turn(url);
      try {
        const res = await axios.get(url, {
          timeout: req.timeout || timeout,
          responseType: req.responseType || 'text',
          headers: { 'User-Agent': DEFAULT_UA, 'Accept-Language': 'zh-CN,zh;q=0.9', ...headers, ...(req.headers || {}) },
          proxy: proxy || undefined,
          ...(req.params ? { params: req.params } : {}),
        });
        return res;
      } catch (err) {
        const status = err.response ? err.response.status : null;
        const canRetry = (status === null || retrySet.has(status)) && attempt < retries;
        if (!canRetry) {
          const wrapped = new Error(`GET ${url} failed${status ? ` (HTTP ${status})` : ` (${err.message})`}`);
          wrapped.status = status;
          wrapped.url = url;
          throw wrapped;
        }
        const delay = retryDelay(status, attempt, backoffMs);
        logger?.warn?.(`retry ${attempt + 1}/${retries} in ${delay}ms`, { url, status });
        await sleep(delay);
      }
    }
  }

  async function getJson(url, req = {}) {
    const res = await get(url, { ...req, responseType: 'json' });
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }

  async function getText(url, req = {}) {
    const res = await get(url, { ...req, responseType: 'text' });
    return res.data;
  }

  return { get, getJson, getText, proxy, rateLimitMs };
}

export default createFetcher;
