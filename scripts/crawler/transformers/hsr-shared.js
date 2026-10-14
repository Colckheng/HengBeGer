export function sourceError(content, detail) {
  return new Error(`hsr content_id=${content?.id ?? '<missing>'}: ${detail}`);
}

export function textValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function commonFrontMatter({ content, localId, existing, now }, type) {
  const sourceId = content?.id;
  if (!/^[1-9]\d*$/.test(String(sourceId))) throw sourceError(content, 'invalid source id');
  const version = content?.version;
  if (!/^(0|[1-9]\d*)$/.test(String(version))) throw sourceError(content, 'invalid version');
  const id = existing?.id ?? localId;
  if (!/^[1-9]\d*$/.test(String(id))) throw sourceError(content, 'invalid local id');
  const name = textValue(existing?.name) || textValue(content?.title);
  if (!name) throw sourceError(content, 'missing name');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw sourceError(content, 'invalid crawl time');
  const title = textValue(content?.title);
  const image = textValue(existing?.image);
  return {
    game: 'hsr',
    type,
    id: String(id),
    name,
    ...(title && title !== name ? { alias: title } : {}),
    tags: ['hsr', type],
    source: 'mihoyo-api',
    source_url: `https://www.miyoushe.com/sr/wiki/content/${sourceId}/detail`,
    version: String(version),
    last_crawled_at: now.toISOString(),
    ...(image ? { image } : {}),
  };
}

export function decodeParts(content, template) {
  const parts = [];
  let found = false;
  if (!Array.isArray(content.contents)) throw sourceError(content, 'missing or invalid contents');
  for (const [index, tab] of (content.contents || []).entries()) {
    const html = textValue(tab?.text);
    for (const match of html.matchAll(/data-data\s*=\s*(["'])([\s\S]*?)\1/g)) {
      found = true;
      let decoded;
      try {
        decoded = JSON.parse(decodeURIComponent(match[2]));
      } catch (err) {
        throw sourceError(content, `contents[${index}] invalid data-data JSON: ${err.message}`);
      }
      if (!Array.isArray(decoded)) throw sourceError(content, `contents[${index}] data-data must be an array`);
      for (const part of decoded) {
        if ((part?.tmplKey || part?.tmk) !== template) continue;
        if (!part.data || typeof part.data !== 'object' || Array.isArray(part.data)) {
          throw sourceError(content, `contents[${index}] ${template}/${part.partKey} missing or invalid data`);
        }
        parts.push(part);
      }
    }
  }
  if (!found) throw sourceError(content, 'missing data-data');
  if (!parts.some((part) => part.partKey === 'main')) throw sourceError(content, `missing ${template}/main`);
  return parts;
}
