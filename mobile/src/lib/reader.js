/**
 * App 端专属的正文预处理（不影响仓库根的 contentModel.js，网页端还要原样用）。
 * - 剥掉游戏内富文本标签（<gridfightinfo> / <unbreak> / <color> …），只保留内部文字；
 * - markdown-it 默认 html:false 会把这些标签当转义文本显示出来，手机上就是一堆裸标签；
 * - 丢掉「**ID**：1001」这种纯采集编号行（属性表已经有更有用的字段）。
 */
const GAME_TAG = /<\/?[a-zA-Z][^>]*>/g;
const ID_LINE = /^\*\*(?:ID|id|Id)\*\*[\s：:]*\S*[\s.]*$/gm;
const ID_LINE_PLAIN = /^\s*(?:ID|id)\s*[：:]\s*\S+\s*$/gm;

/** 把正文里的游戏内富文本标签剥成纯文字。 */
export function stripGameTags(body = '') {
  return String(body).replace(GAME_TAG, '');
}

/** 丢掉「**ID**：1001」/「ID：1001」这种纯编号行。 */
export function dropIdLines(body = '') {
  return String(body).replace(ID_LINE, '').replace(ID_LINE_PLAIN, '');
}

/**
 * 站内条目链接在正文里长这样：[名称](entry:currency/season1/roles/1408)。
 * React Native 的 Markdown 会把 onLinkOpen 交给 Linking，打开 entry: 协议必然失败，
 * 所以要在这里把它换成 App 内的路由。
 */
const ENTRY_LINK = /\(entry:([^)]+)\)/g;

/** 取出正文里所有站内条目 key（去重、保序）。 */
export function entryLinksIn(body = '') {
  const out = [];
  const seen = new Set();
  for (const match of String(body).matchAll(ENTRY_LINK)) {
    const key = match[1].trim();
    if (key && !seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

/** markdown 链接目标是否是站内条目。 */
export function isEntryLink(url) {
  return typeof url === 'string' && url.startsWith('entry:');
}

/** 从 entry: 链接里取出条目 key。 */
export function entryKeyFromLink(url) {
  return isEntryLink(url) ? url.slice('entry:'.length) : '';
}