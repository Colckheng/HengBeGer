/**
 * App 端章节编排：把服务端切好的 20 来个 section 收成几个可折叠分区，
 * 并把 markdown 表格转成键值行，避免 react-native-markdown-display 把表格
 * 渲染成竖向无限堆叠的长条。
 *
 * 服务端 buildSections() 只按 `## 标题` 切块，同一个角色的「晋阶」「行迹」
 * 「技能」「语音」等全都平铺出来；hsr 角色平均 18.9 个 section（最多 24 个），
 * 手机上就是一列看不到头的标题。这里按用途重新分组。
 */

/** 分区定义。fold 表示默认是否折叠。 */
export const SECTION_GROUPS = [
  { id: 'overview', name: '概览', fold: false },
  { id: 'combat', name: '战斗', fold: false },
  { id: 'growth', name: '养成', fold: true },
  { id: 'story', name: '故事', fold: true },
  { id: 'extra', name: '其他', fold: true },
];

/** 标题 -> 分区。顺序即优先级，先命中先算。 */
const GROUP_RULES = [
  { group: 'story', re: /故事|语音|关系|画廊|考据|印象|CV|配音|留言|信赖/ },
  { group: 'growth', re: /材料|资材|晋阶|突破|合成|成长|总属性|推荐|配队|配装|养成/ },
  { group: 'combat', re: /技能|行迹|星魂|影画|普攻|战技|终结技|闪避|秘技|天赋|能力|效果|加伤|伤害|倍率|暴击/ },
  { group: 'extra', re: /角色信息|属性快照|页面|照片|作品|图鉴|其他|信息/ },
];

export function groupOfTitle(title = '') {
  for (const rule of GROUP_RULES) {
    if (rule.re.test(title)) return rule.group;
  }
  return 'overview';
}

/**
 * 把一段 markdown 拆成「块」序列：段落 / 表格 / 列表 / 标题。
 * 表格必须单独识别出来，改用原生 View 渲染，不能交给 Markdown 组件。
 */
const TABLE_LINE = /^\s*\|.*\|\s*$/;

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

/** markdown 表格 -> { headers, rows }；不是表格则返回 null。 */
export function parseTable(block) {
  const lines = String(block ?? '').split(/\r?\n/).filter(line => TABLE_LINE.test(line));
  if (lines.length < 2) return null;
  // 第二行必须是 |---|---| 这种分隔行
  if (!/^[\s|:-]+$/.test(lines[1]) || lines[1].indexOf('-') === -1) return null;
  const headers = splitRow(lines[0]);
  const rows = lines.slice(2).map(splitRow);
  return { headers, rows };
}

/** 把一个 section 的 body 切成块序列。 */
export function splitBlocks(body = '') {
  const text = String(body ?? '');
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'text', text: paragraph.join('\n').trim() });
      paragraph = [];
    }
  };
  for (const line of lines) {
    if (TABLE_LINE.test(line)) {
      flush();
      // 连续的表格行合成一个表格块
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'table') last.lines.push(line);
      else blocks.push({ kind: 'table', lines: [line] });
    } else if (line.trim()) {
      paragraph.push(line);
    } else {
      flush();
    }
  }
  flush();
  return blocks.map(block => (block.kind === 'table'
    ? { kind: 'table', table: parseTable(block.lines.join('\n')) }
    : block));
}

/**
 * 表格 -> 键值行。技能表那种「等级/项目/数据」三列且项目列重复的，
 * 收敛成「等级 -> 项目: 数据」，行数直接砍半以上。
 */
export function tableToRows(table) {
  if (!table) return [];
  const { headers, rows } = table;
  return rows.map(cells => {
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    return row;
  });
}

/**
 * 判断一个表格是否该收敛成键值卡：
 *  - 两列 -> 直接键值；
 *  - 三列以上但最后一列明显是「数值/描述」且前面的列重复度高 -> 键值。
 */
export function isKeyValueTable(table) {
  if (!table || table.rows.length === 0) return false;
  if (table.headers.length <= 2) return true;
  // 首列重复度高（等级 1/1/1/2/2/2 这种）时，把首列当分组键
  const first = table.rows.map(r => r[0]);
  const unique = new Set(first.filter(Boolean));
  return unique.size > 0 && unique.size < table.rows.length;
}

/**
 * 把表格收敛成 [{ key, value }] 供键值卡渲染。
 * 两列表 -> key=headers[0], value=headers[1]。
 * 多列表且首列重复 -> key=首列值, value=其余列拼成 `列名: 值`。
 */
export function tableToKeyValues(table) {
  if (!table) return [];
  const { headers, rows } = table;
  if (headers.length <= 2) {
    return rows
      .filter(cells => cells[0] || cells[1])
      .map(cells => ({ key: cells[0] || '—', value: cells[1] || '' }));
  }
  return rows
    .filter(cells => cells.some(Boolean))
    .map(cells => {
      const key = cells[0] || '—';
      const rest = headers.slice(1).map((header, index) => ({
        header,
        value: cells[index + 1] ?? '',
      })).filter(item => item.value);
      const value = rest.map(item => (item.header ? item.header + '：' + item.value : item.value)).join('　');
      return { key, value };
    });
}

/**
 * 章节 -> 分组。返回 [{ id, name, fold, sections: [{ id, title, blocks }] }]。
 * 空 section（清洗后没内容）直接丢掉。
 */
export function groupSections(sections, options = {}) {
  const maxPerGroup = options.maxPerGroup ?? 6;
  const buckets = new Map();
  for (const section of sections ?? []) {
    const group = groupOfTitle(section.title);
    if (!buckets.has(group)) buckets.set(group, []);
    buckets.get(group).push(section);
  }
  const out = [];
  for (const def of SECTION_GROUPS) {
    const list = buckets.get(def.id) ?? [];
    if (list.length === 0) continue;
    out.push({
      id: def.id,
      name: def.name,
      fold: def.fold,
      sections: list.slice(0, maxPerGroup).map(section => ({
        id: section.id,
        title: section.title,
        blocks: splitBlocks(section.body ?? ''),
      })),
      hidden: Math.max(0, list.length - maxPerGroup),
    });
  }
  return out;
}