/**
 * 无封面条目的占位文字（纯函数，可单测）。
 *
 * 全库 2675 条里 157 条没有 image（hsr/gacha 65 张全无、zzz/enemies 63 张无）。
 * 这些条目之前渲染成一块纯色灰方块，跟「图加载失败」长得一模一样，
 * 看起来像坏了。UI 层用这个函数给占位块写上一个分类词，
 * 一眼就知道「这一条就是没有封面」。
 */
import { CATEGORY_WORDS } from './labels.js';

// 首页六格一块只有 57dp 宽，四个字（投资策略）放得下，五个字就糊
const MAX_CHARS = 4;

/**
 * 占位块里显示的分类短名。
 * - 走 labels.js 的 CATEGORY_WORDS：英文分类 id 换成中文（agents → 代理人），
 *   跟列表页 chip、收藏页的分类名用同一份词表，不会出现两套叫法。
 * - 货币战争的赛季前缀（S1 · ）丢掉，只留业务词。
 * - 词表没覆盖的英文词（说明是新分类）硬截也看不懂，退回「图录」。
 *
 * @param {string} [category] 形如 'zzz/agents'、'currency/season1/roles'
 * @returns {string} 占位文字，空分类返回 '图录'
 */
export function placeholderLabel(category) {
  const parts = String(category || '').split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const season = parts.find((part) => /^season\d+$/i.test(part));
  const known = CATEGORY_WORDS[last];
  // 分类本身是赛季段（currency/season1）→ 'S1'
  if (season && !known) return season.replace(/^season/i, 'S');
  if (known) return known.length > MAX_CHARS ? known.slice(0, MAX_CHARS) : known;
  // 中文的自定义分类词按字截断；英文未覆盖词表截了也看不懂，退回「图录」
  if (last && /[\u4e00-\u9fa5]/.test(last)) return last.length > MAX_CHARS ? last.slice(0, MAX_CHARS) : last;
  return '图录';
}
