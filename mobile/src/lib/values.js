/**
 * 数值可视化：把 markdown 表格里的数值提出来，供详情页画条形图。
 *
 * 数据实况（云端 300 个角色条目全量统计）：
 *   - 711 张表格里 142 张是「多张两列子表粘在一起」（晋阶表 97 行其实是 9 个子表，
 *     材料表的数量列还全空），parseTable 只按第一个表头切，于是渲染成 95 行杂乱列表。
 *   - 末列单元格 31529 个，其中 10887 个（34.5%）是纯数字或纯百分比，集中在
 *     技能 3861 / 晋阶 3032 / 行迹 2963 / 星阶 779 / 总属性加成 207。
 *   - zzz 技能表把数值嵌在文本里：`| 1 | 伤害倍率 | 一段伤害倍率：31.2% 二段伤害倍率：33.7% |`。
 *
 * 这里做三件事：
 *   1. splitTables()  把粘在一起的子表拆开；
 *   2. parseNumber()  从单元格里抽出数值与单位（纯值优先，嵌在文本里的百分比也抽）；
 *   3. tableToSeries() 输出 [{ key, bars: [{ label, text, number, unit }] }] + scale，
 *      同一张表共享一个 scale，条形长度才能横向比较。
 */

const TABLE_LINE = /^\s*\|.*\|\s*$/;

function cellsOf(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isSeparator(line) {
  const text = line.trim();
  return text.length > 0 && /^[\s|:-]+$/.test(text) && text.indexOf('-') !== -1;
}

/** markdown 表格 -> { headers, rows }；不是表格则返回 null。入参可以是字符串或行数组。 */
export function parseTable(block) {
  const lines = (Array.isArray(block) ? block : String(block ?? '').split(/\r?\n/))
    .filter(line => TABLE_LINE.test(line));
  if (lines.length < 2) return null;
  if (!isSeparator(lines[1])) return null;
  return { headers: cellsOf(lines[0]), rows: lines.slice(2).filter(l => !isSeparator(l)).map(cellsOf) };
}

/**
 * 把一段里粘在一起的多张表拆开。
 *
 * 判据：一行后面紧跟分隔行（|---|---|），它就是一行的表头 —— 相邻子表之间没有空行，
 * 所以只能靠「表头 + 分隔行」这个组合来定位边界。晋阶表 97 行按此规则拆成 9 张
 * （属性 / 材料 / 晋阶前后交替），材料表的数量列原本全空，拆开后不再混进属性表。
 */
export function splitTables(body) {
  // 入参可以是整段文本，也可以是 splitBlocks() 给出的行数组。
  // 只认字符串的话，数组会被 String() 拼成逗号串，整段退化成一行 —— 多子表拆分
  // 会静默失效、只渲染第一张表（真机复验时发现）。
  const lines = (Array.isArray(body) ? body : String(body ?? '').split(/\r?\n/))
    .map(line => String(line ?? ''));
  const groups = [];
  let current = null;
  let head = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!TABLE_LINE.test(line)) {
      if (current && current.length) groups.push(current);
      current = null;
      head = null;
      continue;
    }
    // 一行后面紧跟分隔行，它就是一张新表的表头（子表之间没有空行）。
    const isHead = isSeparator(lines[index + 1] || '');
    if (isHead) {
      if (current && current.length) groups.push(current);
      current = [line];
      head = line.trim();
      continue;
    }
    if (!current) {
      current = [line];
      head = head || line.trim();
      continue;
    }
    current.push(line);
  }
  if (current && current.length) groups.push(current);
  return groups.map(parseTable).filter(Boolean);
}

/** 纯数值：123 / 12.5 / 45% / -3.2% */
const PURE_NUMBER = /^(-?\d+(?:\.\d+)?)\s*(%)?$/;
/** 嵌在文本里的百分比：`一段伤害倍率：31.2%`、`伤害提高40%` */
const EMBEDDED_PERCENT = /(-?\d+(?:\.\d+)?)\s*%/g;
/** 千分位：4,368,581 / 76,362,803（zzz 敌人属性表、hsr 属性快照都是这个形态）。 */
const GROUPED_DIGITS = /(\d),(?=\d{3}\b)/g;

/**
 * 从单元格抽数值。纯值优先；抽不到再找文本里的百分比（取第一个）。
 * 千分位先去掉逗号，否则 `4,368,581` 一个都抽不出来，整张表会掉进 Markdown 兜底。
 * 返回 { number, unit } 或 null。
 */
export function parseNumber(cell) {
  const raw = String(cell ?? '').trim();
  if (!raw) return null;
  const text = raw.replace(GROUPED_DIGITS, '$1');
  const pure = PURE_NUMBER.exec(text);
  if (pure) {
    return { number: Number(pure[1]), unit: pure[2] || '' };
  }
  EMBEDDED_PERCENT.lastIndex = 0;
  const hit = EMBEDDED_PERCENT.exec(text);
  if (hit) {
    return { number: Number(hit[1]), unit: '%' };
  }
  return null;
}

/**
 * 表格 -> 条形图序列。
 * 两列：每行一条 bar，label 取首列。
 * 多列：首列做分组键，其余列各一条 bar（等级1 的 数值1/数值2/数值3 并排才看得出增长）。
 * 数值抽不到的行照原样返回 text，只是没有 bar。
 */
export function tableToSeries(table) {
  if (!table || !table.rows || !table.rows.length) return [];
  const headers = table.headers && table.headers.length ? table.headers : [];
  const rows = table.rows;
  const out = [];
  if (headers.length <= 2) {
    for (const cells of rows) {
      const key = cells[0] || '';
      const text = cells[1] ?? '';
      if (!key && !text) continue;
      const parsed = parseNumber(text);
      out.push({ key: key || '—', text, number: parsed ? parsed.number : null, unit: parsed ? parsed.unit : '' });
    }
    return out;
  }
  for (const cells of rows) {
    const key = cells[0] || '—';
    const bars = [];
    for (let index = 1; index < cells.length; index += 1) {
      const text = cells[index] ?? '';
      if (!text) continue;
      const label = headers[index] || ('列' + (index + 1));
      const parsed = parseNumber(text);
      bars.push({ label, text, number: parsed ? parsed.number : null, unit: parsed ? parsed.unit : '' });
    }
    if (!bars.length) continue;
    out.push({ key, bars });
  }
  return out;
}

/**
 * 计算一组序列共享的刻度。百分比至少给 100%，纯数字取组内最大值，
 * 这样「等级1 50%」和「等级12 176%」在同一个尺度上才看得出增长。
 */
export function computeScale(series) {
  let max = 0;
  let anyPercent = false;
  for (const row of series ?? []) {
    const items = row.bars ? row.bars : [row];
    for (const item of items) {
      if (item.number == null) continue;
      const value = Math.abs(item.number);
      if (value > max) max = value;
      if (item.unit === '%') anyPercent = true;
    }
  }
  if (max <= 0) return null;
  return { max: Math.max(max, anyPercent ? 100 : 0), percent: anyPercent };
}

/** 等级型键的判据：等级1 / Lv.3 / LEVEL5 这类逐级递增的键。 */
const LEVEL_KEY = /^(?:等级|Lv\.?|LEVEL)\s*(\d+)$/i;

export function isLevelKey(key) {
  return LEVEL_KEY.test(String(key || '').trim());
}

/**
 * 一串 series 是不是「逐级数值表」：键全是等级、至少 3 级、且至少有一个可画数值。
 * 这类表在手机上最适合用拖动条选等级（拖一下只看当前等级），而不是把 12 行全铺开。
 */
export function isLevelSeries(series) {
  if (!Array.isArray(series) || series.length < 3) return false;
  if (!series.every(row => isLevelKey(row && row.key))) return false;
  return series.some(row => {
    const items = row.bars ? row.bars : [row];
    return items.some(item => item && item.number != null);
  });
}

/**
 * 项目型等级表：`| 等级 | 项目 | 数据 |` —— zzz 代理人的技能表长这样
 *   | 1 | 伤害倍率 | 一段伤害倍率：31.2% 二段伤害倍率：33.7% 三段伤害倍率：113.6% 四段伤害倍率：239.1% |
 *   | 1 | 失衡倍率 | 一段失衡倍率：15.6% 二段失衡倍率：28.7% 三段失衡倍率：89.6% 四段失衡倍率：187.4% |
 *   | 2 | 养成材料 | 基础电击芯片×2、丁尼×2000 |
 * 全量 2675 条里只有 60 条（全是 zzz/agents）带这种表，其余游戏没有。
 * 不能按普通两列/多列表处理：那样「项目」列会被丢掉，伤害倍率与失衡倍率混成一行，
 * 养成材料行也会被当成数值行。这里按等级把「项目 → 数据」聚起来。
 */
const PROJECT_HEADERS = ['等级', '项目', '数据'];

export function isProjectTable(table) {
  const headers = (table && table.headers) || [];
  if (headers.length !== PROJECT_HEADERS.length) return false;
  return PROJECT_HEADERS.every((name, index) => String(headers[index] || '').trim() === name);
}

/**
 * 项目型等级表 -> [{ level, items: [{ label, text, number, unit }] }]。
 * items 保留没有数值的行（养成材料），由渲染层决定怎么显示。
 */
export function projectTableToLevels(table) {
  if (!isProjectTable(table)) return [];
  const levels = [];
  const byLevel = new Map();
  for (const cells of table.rows) {
    const level = String(cells[0] ?? '').trim();
    const label = String(cells[1] ?? '').trim();
    const text = String(cells[2] ?? '').trim();
    if (!level && !label && !text) continue;
    let entry = byLevel.get(level);
    if (!entry) {
      entry = { level, items: [] };
      byLevel.set(level, entry);
      levels.push(entry);
    }
    const parsed = parseNumber(text);
    entry.items.push({ label, text, number: parsed ? parsed.number : null, unit: parsed ? parsed.unit : '', raw: text });
  }
  return levels;
}

/**
 * 把「数据」单元格里的多段数值拆开：
 *   `一段伤害倍率：31.2% 二段伤害倍率：33.7%` -> [{ label:'一段', text:'31.2%', number:31.2, unit:'%' }, ...]
 * 拆不出多段的返回空数组（调用方退回整段文本）。
 */
export function splitSegments(text) {
  const source = String(text ?? '').trim();
  if (!source) return [];
  const out = [];
  const re = /([^：:\s][^：:]*?)[：:]\s*(-?\d+(?:\.\d+)?\s*%?)/g;
  let hit;
  while ((hit = re.exec(source)) !== null) {
    const label = shortenSegmentLabel(hit[1]);
    const value = hit[2].trim();
    const parsed = parseNumber(value);
    if (!label || !parsed) continue;
    out.push({ label, text: value, number: parsed.number, unit: parsed.unit });
  }
  return out.length >= 2 ? out : [];
}

/**
 * 段标签瘦身：`一段伤害倍率` -> `一段伤害`。
 * 条形标签列只有几十 dp，末位「倍率/加成/数值」这类后缀在同组内高度重复，
 * 留着只会把真正区分各段的「一段/二段」挤掉（真机上就截断成了「一段伤害倍…」）。
 */
export function shortenSegmentLabel(label) {
  const text = String(label ?? '').trim();
  if (!text) return '';
  const trimmed = text.replace(/(?:倍率|加成|数值|提升|系数)$/, '');
  return trimmed || text;
}

/**
 * 项目型表里「数据」列的单值形态：`伤害倍率：328.6%`。
 * 项目名已经单独做标题了，值里的重复前缀要去掉，否则一屏里同一个词出现两遍。
 */
export function stripLabelPrefix(text, label) {
  const source = String(text ?? '').trim();
  const name = String(label ?? '').trim();
  if (!source || !name) return source;
  const head = name + '：';
  const headAscii = name + ':';
  if (source.startsWith(head)) return source.slice(head.length).trim();
  if (source.startsWith(headAscii)) return source.slice(headAscii.length).trim();
  return source;
}

/**
 * 属性快照单元格：`生命值：603 攻击力：95 防御力：49 暴击率：5.0%`。
 * 与 splitSegments 的区别是分隔符 —— 快照用空格分条，段值也允许是纯数字。
 */
const STAT_SEGMENT = /([^\s：:、]+)[：:]\s*(-?\d+(?:\.\d+)?\s*%?)/g;

/** 从属性快照单元格里抽出 [{ label, text, number, unit }]。 */
export function parseStatSegments(text) {
  const source = String(text ?? '').trim();
  if (!source) return [];
  const out = [];
  STAT_SEGMENT.lastIndex = 0;
  let hit;
  while ((hit = STAT_SEGMENT.exec(source)) !== null) {
    const label = hit[1].trim();
    const value = hit[2].trim();
    const parsed = parseNumber(value);
    if (!label || !parsed) continue;
    out.push({ label, text: value, number: parsed.number, unit: parsed.unit });
  }
  return out;
}

/**
 * 属性快照里的「突破前 / 突破后」：同一格里 `生命值：1339 … 生命值：1753 …`，
 * 标签重复出现就切一组。返回 [[段...], [段...]]。
 */
export function groupStatSegments(segments) {
  const groups = [];
  let current = [];
  const seen = new Set();
  for (const segment of segments ?? []) {
    if (seen.has(segment.label) && current.length) {
      groups.push(current);
      current = [];
      seen.clear();
    }
    seen.add(segment.label);
    current.push(segment);
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * 属性快照表：`| 等级 | 项目 | 数据 |` 但等级列是「总计/初始/10/20/…/满级」、
 * 项目列大面积为空、数据列是整串属性。
 * 与真技能表（等级 1..16 + 项目 伤害倍率/失衡倍率）的关键差别就是这两点：
 * 项目列空 + 数据列能拆出多条 `属性：值`。全库 69 张（60 个 zzz 代理人各一张）。
 */
export function isStatSnapshotTable(table) {
  if (!isProjectTable(table)) return false;
  const rows = (table && table.rows) || [];
  if (rows.length < 3) return false;
  let statRows = 0;
  let emptyProject = 0;
  for (const cells of rows) {
    if (!String(cells[1] ?? '').trim()) emptyProject += 1;
    if (parseStatSegments(cells[2]).length >= 2) statRows += 1;
  }
  return statRows >= 2 && emptyProject * 2 >= rows.length;
}

/**
 * 属性快照表 -> { levels: [{ level, stats: [[段...]], materials }], total }。
 * stats 每项是一组（突破前/突破后各一组），materials 是该级的晋升材料。
 * 「总计」那一行是全表材料合计（源数据把数字和名字粘在一起），单独返回给渲染层。
 */
export function statSnapshotTableToLevels(table) {
  if (!isStatSnapshotTable(table)) return { levels: [], total: '' };
  const levels = [];
  const byLevel = new Map();
  let total = '';
  for (const cells of table.rows) {
    const level = String(cells[0] ?? '').trim();
    const project = String(cells[1] ?? '').trim();
    const text = String(cells[2] ?? '').trim();
    if (!level && !text) continue;
    const segments = parseStatSegments(text);
    // 「总计」行是材料合计，没有属性，也不属于任何等级。
    if (level === '总计' || (!project && segments.length === 0)) {
      if (!total && text) total = text;
      continue;
    }
    let entry = byLevel.get(level);
    if (!entry) {
      entry = { level, stats: [], materials: '' };
      byLevel.set(level, entry);
      levels.push(entry);
    }
    if (segments.length >= 2) entry.stats = groupStatSegments(segments);
    else if (text) entry.materials = entry.materials ? entry.materials + '、' + text : text;
  }
  return { levels: levels.filter(item => item.stats.length || item.materials), total };
}

/**
 * 「总计」行的材料合计是源数据直接拼出来的字符串，数字和名字之间没有任何分隔：
 * `4初阶击破认证章32高阶击破认证章30破阵者认证章…370.5w丁尼`。
 * 按「数字 + 名字」切成 [{ name, count }]，渲染成 chips 才读得懂。
 * 已经有 `×` 或 `、` 分隔的正常材料文本原样返回空数组，交给调用方走纯文本。
 */
export function splitMaterialRun(text) {
  const source = String(text ?? '').trim();
  if (!source || /[×xX]\s*\d|、/.test(source)) return [];
  const out = [];
  const pattern = /(\d+(?:\.\d+)?w?)\s*([^\d]+)/g;
  let hit;
  let consumed = 0;
  while ((hit = pattern.exec(source)) !== null) {
    const name = hit[2].trim();
    if (!name) continue;
    out.push({ name, count: hit[1] });
    consumed += hit[0].length;
  }
  // 至少两条、且几乎覆盖全文才算「粘连串」，否则是普通文本。
  if (out.length < 2 || consumed < source.length * 0.9) return [];
  return out;
}

/** 核心技的等级键是 A~F 这种单字母，不是数字，不能当等级项目表拖。 */
const RANK_KEY = /^[A-Fa-f]$/;

export function isRankTable(table) {
  if (!isProjectTable(table)) return false;
  const rows = (table && table.rows) || [];
  if (rows.length < 2) return false;
  return rows.every(cells => RANK_KEY.test(String(cells[0] ?? '').trim()));
}

/**
 * 核心技表 -> [{ rank, effect, materials, percent }]。
 * 全库 59 张（59 个 zzz 代理人各一张），A~F 逐级强化，effect 末尾的百分比就是
 * 该级核心被动的失衡/增伤数值，抽出来画一条 A→F 递增的进度条才有意义。
 */
export function rankTableToRows(table) {
  if (!isRankTable(table)) return [];
  const out = [];
  const byRank = new Map();
  for (const cells of table.rows) {
    const rank = String(cells[0] ?? '').trim().toUpperCase();
    const project = String(cells[1] ?? '').trim();
    const text = String(cells[2] ?? '').trim();
    if (!rank) continue;
    let entry = byRank.get(rank);
    if (!entry) {
      entry = { rank, effect: '', materials: '', percent: null };
      byRank.set(rank, entry);
      out.push(entry);
    }
    if (project === '养成材料') {
      if (text) entry.materials = text;
    } else if (text) {
      entry.effect = text;
      const percents = text.match(/-?\d+(?:\.\d+)?\s*%/g);
      if (percents && percents.length) {
        const parsed = parseNumber(percents[percents.length - 1]);
        if (parsed) entry.percent = parsed.number;
      }
    }
  }
  return out;
}


/** 序列里有没有可画的 bar。 */
export function hasBars(series) {
  for (const row of series ?? []) {
    const items = row.bars ? row.bars : [row];
    if (items.some(item => item.number != null)) return true;
  }
  return false;
}

/**
 * 有文本的格子里，能抽出数值的占比。
 * 用来判断一张表到底该画条形还是排成文本网格：
 *   `WL | 角色EXP | 掉落` 这种混着长文本列的表，画条形会把整列文字悄悄丢掉；
 *   `类型 | 星级 | 名称 | 游戏ID` 这种名册表更是只该按文本排。
 * 低于阈值就走文本网格（阈值由调用方决定）。
 */
export function numericRatio(series) {
  let total = 0;
  let numeric = 0;
  for (const row of series ?? []) {
    const items = row.bars ? row.bars : [row];
    for (const item of items) {
      if (!String(item.text ?? '').trim()) continue;
      total += 1;
      if (item.number != null) numeric += 1;
    }
  }
  return total ? numeric / total : 0;
}
