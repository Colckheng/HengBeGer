function decodeDataData(html) {
  const m = /data-data="([^"]+)"/.exec(html);
  return m ? JSON.parse(decodeURIComponent(m[1])) : [];
}

export function transformHsrRelic({ content, listItem, localId, existing, now = new Date() }) {
  const f = (listItem && listItem.filters) || {};
  const decoded = decodeDataData(content.contents?.[0]?.text || '');
  const mainParts = decoded.filter((n) => (n.tmplKey || n.tmk) === 'heritage' && n.partKey === 'main');

  const name = (existing && existing.name) || content.title;
  const alias = content.title !== name ? content.title : undefined;

  let setName = '';
  let type = '';
  for (const p of mainParts) {
    const d = p.data;
    if (d.content && d.content[0]?.name === '套装名称') setName = d.content[0].value || '';
    if (d.desc) {
      const m = /隧洞遗器|遗器·(.+?)(?:<|$)/.exec(d.desc);
      if (m) type = m[1] || m[0].replace('遗器·', '');
    }
  }
  if (!type && f['套装种类']) type = f['套装种类'].replace('遗器·', '');

  const fm = {
    game: 'hsr',
    type: 'relic',
    id: String(localId),
    name,
    ...(alias ? { alias } : {}),
    tags: ['hsr', 'relic'],
    ...(type ? { 类型: type } : {}),
    ...(setName ? { 套装名称: setName } : {}),
    source: 'mihoyo-api',
    source_url: `https://www.miyoushe.com/sr/wiki/content/${content.id}/detail`,
    version: String(content.version),
    last_crawled_at: now.toISOString(),
    image: (existing && existing.image) || '',
  };
  Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);
  return { fm, sections: [] };
}

export default transformHsrRelic;