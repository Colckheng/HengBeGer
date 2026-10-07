const ZZZ_CDN = 'https://static.nanoka.cc/zzz';

export function enemySourceUrl(version, rel) {
  return `${ZZZ_CDN}/${version}/${rel}`;
}

export function refreshEnemyFm({ existingFm, fields, sourceUrl, version, now }) {
  const clean = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined || v === null || v === '') continue;
    clean[k] = v;
  }
  return {
    ...existingFm,
    ...clean,
    source: 'nanoka',
    source_url: sourceUrl,
    version,
    last_crawled_at: now,
  };
}

const DATE_RANGE = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ~ (\d{4}-\d{2}-\d{2})/;

export function syncBossBodyDates(body, fields = {}) {
  const text = String(body || '');
  if (!fields['开始'] || !fields['结束']) return text;
  if (!DATE_RANGE.test(text)) return text;
  return text.replace(DATE_RANGE, `${fields['开始']} ~ ${fields['结束']}`);
}

export default {
  enemySourceUrl,
  refreshEnemyFm,
  syncBossBodyDates,
};
