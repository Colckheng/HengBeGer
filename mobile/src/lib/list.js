/** 图鉴列表的筛选与分页（纯函数，可单测）。 */

export function filterItems(items, { category = '', q = '', page = 1, limit = 30 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const needle = String(q || '').trim().toLowerCase();
  const filtered = list.filter((item) => {
    const itemCategory = String(item.category || '');
    if (category && itemCategory !== category && !itemCategory.startsWith(category + '/')) return false;
    if (!needle) return true;
    return [item.name, item.rawName, item.key]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });

  const pageSize = Math.max(1, Number(limit) || 30);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (current - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page: current,
    pageCount,
    pageSize,
  };
}

export function categoriesOf(index, worldId = '') {
  const groups = Array.isArray(index && index.groups) ? index.groups : [];
  return groups
    .filter((group) => !worldId || String(group.id).startsWith(worldId + '/'))
    .map((group) => ({ id: group.id, name: group.name, count: group.count ?? group.total ?? 0 }));
}
