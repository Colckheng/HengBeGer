/** 把条目元数据摊平成「标签 / 值」行（纯函数，可单测）。 */

/** 内部字段不展示：它们是采集链路的元信息，不是资料内容。 */
const HIDDEN = new Set([
  'id', 'game', 'name', 'tags', 'type', 'image', 'image_source', 'image_match',
  'source', 'source_url', 'detail', 'detailFile', 'key', 'category', 'rawName',
  'content_hash', 'imageHash', 'updated_at', 'createdAt', 'updatedAt',
  // 采集链路元信息：对读者没有意义，且值常常是很长的 URL / 时间戳，会把属性表撑爆。
  'last_crawled_at', 'image_source_url', 'crawled_at', 'crawler', 'snapshot',
  'detail_url', 'detail_source', 'matched_by', 'match_strategy', 'notes',
]);

const LABELS = {
  type: '类型', version: '版本', rarity: '稀有度', element: '属性',
  faction: '阵营', role: '定位', alias: '别名', stars: '星级',
  level: '等级', skill: '技能', weapon: '武器', gear: '装备',
  season: '赛季', quality: '品质', effect: '效果', cost: '费用',
};

/**
 * 采集侧的内部版本号不能直接给读者看：
 *   hsr 的 version 是内容版本序号（"77"），zzz 的是抓取时间戳（"1767587851"），
 *   只有货币战争的 version 才是真正有意义的版本号（"4.6.51"）。
 * 判据：只有 x.y 形式的语义版本才展示，其余当作采集元信息跳过。
 */
const SEMANTIC_VERSION = /^\d+\.\d+/;

/** 接口对 fields 有两种形状：数组（一个元素一份元数据）或单个对象，两种都要吃。 */
export function describeFields(entry) {
  const fields = entry && entry.fields;
  const blocks = Array.isArray(fields) ? fields : fields && typeof fields === 'object' ? [fields] : [];
  const rows = [];
  const seen = new Set();
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    for (const [key, value] of Object.entries(block)) {
      if (HIDDEN.has(key) || seen.has(key)) continue;
      if (value === null || value === undefined || value === '') continue;
      if (typeof value === 'object') continue;
      if (key === 'version' && !SEMANTIC_VERSION.test(String(value))) continue;
      seen.add(key);
      rows.push({ label: LABELS[key] || key, value: String(value) });
    }
  }
  return rows;
}
