import { table } from '../html.js';

function extractContentId(url) {
  const m = /\/content\/(\d+)\//.exec(url || '');
  return m ? m[1] : '';
}

export function transformGacha({ game, pool, titleMap = new Map(), now = new Date() }) {
  const fm = {
    game,
    type: 'gacha',
    id: String(pool.id),
    name: pool.title,
    tags: [game, 'gacha'],
    start_time: pool.start_time || '',
    end_time: pool.end_time || '',
    source: 'mihoyo-api',
    source_url: pool.activity_url || '',
    version: 'unknown',
    last_crawled_at: now.toISOString(),
    image: '',
  };

  const rows = [];
  for (const item of pool.pool || []) {
    const cid = extractContentId(item.url);
    let ext = {};
    try {
      ext = item.ext ? JSON.parse(item.ext) : {};
    } catch {
      ext = {};
    }
    rows.push([
      ext.type === 'people' ? '代理人' : ext.type === 'music' ? '音擎' : '',
      ext.level ? ext.level.toUpperCase() : '',
      titleMap.get(Number(cid)) || cid,
      cid,
    ]);
  }

  const blocks = [];
  if (rows.length) {
    blocks.push(table(['类型', '稀有度', '名称', '内容ID'], rows));
  }
  if (pool.content_before_act) {
    blocks.push(`**活动状态**：${pool.content_before_act}`);
  }
  if (pool.activity_url) {
    blocks.push(`**活动页**：${pool.activity_url}`);
  }

  const sections = [];
  if (blocks.length) sections.push({ heading: '## UP 一览', content: blocks.join('\n\n') });

  return { fm, sections };
}

export default transformGacha;
