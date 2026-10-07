const HOST = 'https://act-api-takumi-static.mihoyo.com';

export const CHANNELS = {
  'zzz/character': 43,
  'zzz/bangboo': 44,
  'zzz/weapon': 45,
  'zzz/equipment': 46,
  'zzz/enemy': 65,
  'hsr/character': 18,
  'hsr/lightcone': 19,
  'hsr/enemy': 23,
  'hsr/relic': 30,
};

const appOf = (game) => (game === 'zzz' ? 'zzz' : 'sr');
const wikiOf = (game) => (game === 'zzz' ? 'zzz_wiki' : 'sr_wiki');

export function parseFilters(extStr) {
  try {
    const outer = JSON.parse(extStr);
    const inner = Object.values(outer)[0];
    const text = JSON.parse(inner.filter.text);
    const out = {};
    for (const pair of text) {
      const i = pair.indexOf('/');
      if (i > 0) out[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return out;
  } catch {
    return {};
  }
}

export function createMihoyoSource(fetcher, opts = {}) {
  const host = opts.host || HOST;
  const extra = opts.headers || {};
  const headers = (game) => ({ 'x-rpc-wiki_app': appOf(game), Referer: 'https://baike.mihoyo.com/', ...extra });

  async function listChannel(game, channelId) {
    const wiki = wikiOf(game);
    const j = await fetcher.getJson(`${host}/common/blackboard/${wiki}/v1/home/content/list?app_sn=${wiki}&channel_id=${channelId}`, {
      headers: headers(game),
    });
    const node = j.data && j.data.list && j.data.list[0];
    if (j.retcode !== 0 || !node) throw new Error(`listChannel ${game}/${channelId} failed: retcode=${j.retcode}`);
    return (node.list || []).map((e) => ({
      content_id: e.content_id,
      title: e.title,
      alias: e.alias_name || '',
      icon: e.icon || '',
      corner: e.corner_mark || '',
      picture: (() => {
        try {
          const outer = JSON.parse(e.ext);
          const inner = Object.values(outer)[0];
          return (inner.filter && inner.filter.picture && inner.filter.picture.list) || [];
        } catch {
          return [];
        }
      })(),
      filters: parseFilters(e.ext),
    }));
  }

  async function getZzzEntry(id) {
    const j = await fetcher.getJson(`${host}/hoyowiki/zzz/wapi/entry_page?app_sn=zzz_wiki&entry_page_id=${id}&lang=zh-cn`, {
      headers: headers('zzz'),
    });
    if (j.retcode !== 0 || !j.data || !j.data.page) throw new Error(`getZzzEntry ${id} failed: retcode=${j.retcode}`);
    return j.data.page;
  }

  async function getHsrContent(id) {
    const j = await fetcher.getJson(`${host}/common/blackboard/sr_wiki/v1/content/info?app_sn=sr_wiki&content_id=${id}`, {
      headers: headers('hsr'),
    });
    if (j.retcode !== 0 || !j.data || !j.data.content) throw new Error(`getHsrContent ${id} failed: retcode=${j.retcode}`);
    return j.data.content;
  }

  async function getGacha(game) {
    const wiki = wikiOf(game);
    const j = await fetcher.getJson(`${host}/common/blackboard/${wiki}/v1/gacha_pool?app_sn=${wiki}`, { headers: headers(game) });
    if (j.retcode !== 0 || !j.data) throw new Error(`getGacha ${game} failed: retcode=${j.retcode}`);
    return j.data.list || [];
  }

  async function resolveTitles(game, ids) {
    const unique = [...new Set(ids.map(Number).filter((n) => Number.isFinite(n)))];
    if (!unique.length) return new Map();
    if (game === 'zzz') {
      const j = await fetcher.getJson(
        `${host}/hoyowiki/zzz/wapi/entry_pages?str_entry_page_ids=${unique.join(',')}&lang=zh-cn&app_sn=zzz_wiki`,
        { headers: headers('zzz') },
      );
      if (j.retcode !== 0) throw new Error(`resolveTitles zzz failed: retcode=${j.retcode}`);
      return new Map((j.data.entry_pages || []).map((p) => [Number(p.id), p.name]));
    }
    const j = await fetcher.getJson(`${host}/common/blackboard/sr_wiki/v1/content/batch_get_list?app_sn=sr_wiki&content_ids=${unique.join(',')}`, {
      headers: headers('hsr'),
    });
    if (j.retcode !== 0) throw new Error(`resolveTitles hsr failed: retcode=${j.retcode}`);
    return new Map((j.data.list || []).map((x) => [Number(x.content_id), x.title]));
  }

  return { listChannel, getZzzEntry, getHsrContent, getGacha, resolveTitles, host };
}

export default createMihoyoSource;
