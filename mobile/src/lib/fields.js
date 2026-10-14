/** 把条目元数据摊平成「标签 / 值」行（纯函数，可单测）。 */

/** 内部字段不展示：它们是采集链路的元信息，不是资料内容。 */
const HIDDEN = new Set([
  'id', 'game', 'name', 'tags', 'type', 'image', 'image_source', 'image_match',
  'source', 'source_url', 'detail', 'detailFile', 'key', 'category', 'rawName',
  'content_hash', 'imageHash', 'updated_at', 'createdAt', 'updatedAt',
]);

const LABELS = { type: '类型', version: '版本' };

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
      seen.add(key);
      rows.push({ label: LABELS[key] || key, value: String(value) });
    }
  }
  return rows;
}
