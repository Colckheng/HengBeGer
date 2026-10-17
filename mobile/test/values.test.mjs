import assert from 'node:assert/strict';
import test from 'node:test';
import { computeScale, groupStatSegments, hasBars, isLevelSeries, isProjectTable, isRankTable, isStatSnapshotTable, parseNumber, parseStatSegments, parseTable, projectTableToLevels, rankTableToRows, shortenSegmentLabel, splitMaterialRun, splitSegments, splitTables, statSnapshotTableToLevels, stripLabelPrefix, tableToSeries } from '../src/lib/values.js';

test('parseNumber 纯值', () => {
  assert.deepEqual(parseNumber('50%'), { number: 50, unit: '%' });
  assert.deepEqual(parseNumber('147'), { number: 147, unit: '' });
  assert.deepEqual(parseNumber('12.5'), { number: 12.5, unit: '' });
  assert.deepEqual(parseNumber('-3.2%'), { number: -3.2, unit: '%' });
  assert.equal(parseNumber('星核猎手'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber(undefined), null);
});

test('parseNumber 嵌在文本里的百分比', () => {
  assert.deepEqual(parseNumber('一段伤害倍率：31.2%'), { number: 31.2, unit: '%' });
  assert.deepEqual(parseNumber('二段伤害倍率：33.7% 三段伤害倍率：113.6%'), { number: 33.7, unit: '%' });
  assert.equal(parseNumber('丁尼×2000'), null);
});

test('parseNumber 认得千分位（zzz 敌人属性表、hsr 属性快照）', () => {
  assert.deepEqual(parseNumber('4,368,581'), { number: 4368581, unit: '' });
  assert.deepEqual(parseNumber('76,362,803'), { number: 76362803, unit: '' });
  assert.deepEqual(parseNumber('1,234'), { number: 1234, unit: '' });
  assert.deepEqual(parseNumber('2,250'), { number: 2250, unit: '' });
  // 不是千分位形态的逗号不动：中文顿号、句读
  assert.equal(parseNumber('信用点、铁卫扣饰'), null);
  assert.equal(parseNumber('1,23'), null);
});

test('splitTables 拆开粘在一起的子表', () => {
  const body = [
    '| 属性 | 值 |',
    '| --- | --- |',
    '| 生命值 | 144 |',
    '| 材料 | 数量 |',
    '| --- | --- |',
    '| 风雪之角 |  |',
    '| 属性 | 值 |',
    '| --- | --- |',
    '| 生命值 | 1058 |',
  ].join(String.fromCharCode(10));
  const tables = splitTables(body);
  assert.equal(tables.length, 3);
  assert.deepEqual(tables[0].headers, ['属性', '值']);
  assert.deepEqual(tables[0].rows, [['生命值', '144']]);
  assert.deepEqual(tables[1].headers, ['材料', '数量']);
  assert.deepEqual(tables[1].rows, [['风雪之角', '']]);
  assert.deepEqual(tables[2].headers, ['属性', '值']);
  assert.deepEqual(tables[2].rows, [['生命值', '1058']]);
});

test('splitTables 单表与空输入', () => {
  assert.equal(splitTables('| a | b |').length, 0);
  assert.equal(splitTables('').length, 0);
  assert.equal(splitTables(undefined).length, 0);
  assert.equal(splitTables('正文没有表格').length, 0);
});


test('splitTables 接受行数组（详情页传的就是 tableLines）', () => {
  // 真机复验时发现的坑：splitBlocks() 给出的是行数组，splitTables 只认字符串时
  // 数组被 String() 拼成逗号串，整段退化成一行 —— 多子表拆分静默失效，只渲染第一张表。
  const lines = [
    '| 属性 | 值 |',
    '| --- | --- |',
    '| 生命值 | 144 |',
    '| 材料 | 数量 |',
    '| --- | --- |',
    '| 风雪之角 |  |',
  ];
  const tables = splitTables(lines);
  assert.equal(tables.length, 2);
  assert.deepEqual(tables[0].headers, ['属性', '值']);
  assert.deepEqual(tables[1].headers, ['材料', '数量']);
  // 字符串与数组两种入参结果必须一致。
  assert.deepEqual(splitTables(lines.join(String.fromCharCode(10))), tables);
});
test('tableToSeries 两列', () => {
  const series = tableToSeries(parseTable([
    '| 等级 | 数值1 |',
    '| --- | --- |',
    '| 等级1 | 50% |',
    '| 等级2 | 60% |',
  ].join(String.fromCharCode(10))));
  assert.deepEqual(series, [
    { key: '等级1', text: '50%', number: 50, unit: '%' },
    { key: '等级2', text: '60%', number: 60, unit: '%' },
  ]);
  assert.deepEqual(computeScale(series), { max: 100, percent: true });
  assert.equal(hasBars(series), true);
});

test('tableToSeries 多列：首列做分组键', () => {
  const series = tableToSeries(parseTable([
    '| 等级 | 数值1 | 数值2 | 数值3 |',
    '| --- | --- | --- | --- |',
    '| 等级1 | 80% | 30% | 60% |',
    '| 等级2 | 88% | 33% | 61% |',
  ].join(String.fromCharCode(10))));
  assert.equal(series.length, 2);
  assert.equal(series[0].key, '等级1');
  assert.equal(series[0].bars.length, 3);
  assert.deepEqual(series[0].bars[0], { label: '数值1', text: '80%', number: 80, unit: '%' });
});

test('tableToSeries zzz 技能表：数值嵌在文本里', () => {
  const series = tableToSeries(parseTable([
    '| 等级 | 项目 | 数据 |',
    '| --- | --- | --- |',
    '| 1 | 伤害倍率 | 一段伤害倍率：31.2% 二段伤害倍率：33.7% |',
    '| 1 | 养成材料 | 丁尼×2000 |',
  ].join(String.fromCharCode(10))));
  assert.equal(series.length, 2);
  assert.equal(series[0].key, '1');
  // 多列时首列是分组键，其余列各一条 bar：bars[0] 是「项目」（文本），bars[1] 是「数据」。
  assert.equal(series[0].bars[0].label, '项目');
  assert.equal(series[0].bars[0].number, null);
  assert.equal(series[0].bars[1].label, '数据');
  assert.equal(series[0].bars[1].number, 31.2);
  assert.equal(series[1].bars[1].number, null);
  assert.equal(series[1].bars[1].text, '丁尼×2000');
});

test('computeScale 纯数字取组内最大值', () => {
  const series = tableToSeries(parseTable([
    '| 属性 | 值 |',
    '| --- | --- |',
    '| 生命值 | 147 |',
    '| 攻击力 | 92 |',
  ].join(String.fromCharCode(10))));
  assert.deepEqual(computeScale(series), { max: 147, percent: false });
});

test('hasBars 全是文本时为 false', () => {
  const series = tableToSeries(parseTable([
    '| 语言 | 配音 |',
    '| --- | --- |',
    '| 日语 | 水树奈奈 |',
  ].join(String.fromCharCode(10))));
  assert.equal(hasBars(series), false);
  assert.equal(computeScale(series), null);
});

test('空表不炸', () => {
  assert.deepEqual(tableToSeries(null), []);
  assert.deepEqual(tableToSeries({ headers: [], rows: [] }), []);
  assert.equal(hasBars([]), false);
  assert.equal(computeScale([]), null);
});
test('isLevelSeries：等级键 + 至少 3 级才算拖动条候选', () => {
  const level = (n) => ({ key: '等级' + n, text: n + '0%', number: n * 10, unit: '%' });
  assert.equal(isLevelSeries([level(1), level(2), level(3)]), true);
  // 只有 2 级 → 不给拖动条，直接画两根条形更直观
  assert.equal(isLevelSeries([level(1), level(2)]), false);
  // 键不是等级（属性/值表）→ 不是等级序列
  assert.equal(isLevelSeries([{ key: '生命值' }, { key: '攻击力' }, { key: '防御力' }]), false);
  // Lv.1 这种写法也要认（同样要求至少一个可画数值）
  const lv = (n) => ({ key: 'Lv.' + n, text: n + '0%', number: n * 10, unit: '%' });
  assert.equal(isLevelSeries([lv(1), lv(2), lv(3)]), true);
  // 全是文本、没有可画数值 → 不给拖动条（拖了也是空轨道）
  assert.equal(isLevelSeries([{ key: '等级1' }, { key: '等级2' }, { key: '等级3' }]), false);
  assert.deepEqual(isLevelSeries([]), false);
  assert.deepEqual(isLevelSeries(null), false);
});

test('isLevelSeries：多列等级表（行迹 等级1 数值1/数值2）', () => {
  const series = tableToSeries(parseTable([
    '| 等级 | 数值1 | 数值2 |',
    '| --- | --- | --- |',
    '| 等级1 | 38% | 190 |',
    '| 等级2 | 40% | 304 |',
    '| 等级3 | 42% | 418 |',
  ].join(String.fromCharCode(10))));
  assert.equal(isLevelSeries(series), true);
  assert.deepEqual(computeScale(series), { max: 418, percent: true });
});
test('isProjectTable：只认 | 等级 | 项目 | 数据 | 三列', () => {
  assert.equal(isProjectTable(parseTable(['| 等级 | 项目 | 数据 |', '| --- | --- | --- |', '| 1 | 伤害倍率 | 31.2% |'])), true);
  assert.equal(isProjectTable(parseTable(['| 等级 | 数值1 |', '| --- | --- |', '| 等级1 | 50% |'])), false);
  assert.equal(isProjectTable(parseTable(['| 等级 | 项目 | 数据 | 备注 |', '| --- | --- | --- | --- |', '| 1 | 伤害倍率 | 31.2% | x |'])), false);
  assert.equal(isProjectTable(null), false);
});

test('projectTableToLevels：按等级聚合项目，保留无数值行', () => {
  const table = parseTable([
    '| 等级 | 项目 | 数据 |',
    '| --- | --- | --- |',
    '| 1 | 伤害倍率 | 一段伤害倍率：31.2% 二段伤害倍率：33.7% |',
    '| 1 | 失衡倍率 | 一段失衡倍率：15.6% |',
    '| 2 | 养成材料 | 基础电击芯片×2、丁尼×2000 |',
    '| 2 | 伤害倍率 | 一段伤害倍率：34.1% |',
  ]);
  const levels = projectTableToLevels(table);
  assert.equal(levels.length, 2);
  assert.equal(levels[0].level, '1');
  assert.deepEqual(levels[0].items.map(i => i.label), ['伤害倍率', '失衡倍率']);
  // 「数据」单元格里第一段数值被抽出来做为兜底 number
  assert.equal(levels[0].items[0].number, 31.2);
  // 养成材料没有百分比 → number 为 null，但仍保留成一项
  const material = levels[1].items.find(i => i.label === '养成材料');
  assert.equal(material.number, null);
  assert.equal(material.text, '基础电击芯片×2、丁尼×2000');
  assert.deepEqual(projectTableToLevels(parseTable(['| a | b |', '| --- | --- |', '| 1 | 2 |'])), []);
});

test('splitSegments：一格里多段数值拆成多条 bar', () => {
  const segments = splitSegments('一段伤害倍率：31.2% 二段伤害倍率：33.7% 三段伤害倍率：113.6%');
  // 标签已瘦身（去掉尾部「倍率」），否则真机上会被截断成「一段伤害倍…」
  assert.deepEqual(segments.map(s => s.label), ['一段伤害', '二段伤害', '三段伤害']);
  assert.deepEqual(segments.map(s => s.number), [31.2, 33.7, 113.6]);
  assert.equal(segments[0].unit, '%');
  // 只有一段 → 返回空数组，调用方按单值处理
  assert.deepEqual(splitSegments('一段伤害倍率：31.2%'), []);
  // 材料文本里没有「标签：数值」形态 → 空数组
  assert.deepEqual(splitSegments('基础电击芯片×2、丁尼×2000'), []);
  assert.deepEqual(splitSegments(''), []);
  assert.deepEqual(splitSegments(undefined), []);
});

test('splitSegments 结果能算出共享刻度', () => {
  const segments = splitSegments('一段伤害倍率：31.2% 二段伤害倍率：33.7% 三段伤害倍率：239.1%');
  const scale = computeScale(segments);
  // 最大值 239.1% 且是百分比刻度
  assert.equal(scale.max, 239.1);
  assert.equal(scale.percent, true);
});
test('shortenSegmentLabel：段标签去掉尾部冗余词', () => {
  assert.equal(shortenSegmentLabel('一段伤害倍率'), '一段伤害');
  assert.equal(shortenSegmentLabel('二段失衡倍率'), '二段失衡');
  assert.equal(shortenSegmentLabel('伤害加成'), '伤害');
  // 全是冗余词时不能返回空串
  assert.equal(shortenSegmentLabel('倍率'), '倍率');
  assert.equal(shortenSegmentLabel('一段'), '一段');
  assert.equal(shortenSegmentLabel(''), '');
  assert.equal(shortenSegmentLabel(undefined), '');
});

test('stripLabelPrefix：单值行去掉重复的项目名前缀', () => {
  assert.equal(stripLabelPrefix('伤害倍率：328.6%', '伤害倍率'), '328.6%');
  assert.equal(stripLabelPrefix('伤害倍率: 328.6%', '伤害倍率'), '328.6%');
  // 前缀对不上就原样返回
  assert.equal(stripLabelPrefix('失衡倍率：142.4%', '伤害倍率'), '失衡倍率：142.4%');
  assert.equal(stripLabelPrefix('基础电击芯片×2', '养成材料'), '基础电击芯片×2');
  assert.equal(stripLabelPrefix('', '伤害倍率'), '');
  assert.equal(stripLabelPrefix('328.6%', ''), '328.6%');
});

test('parseStatSegments：属性快照单元格按空格拆条', () => {
  const segments = parseStatSegments('生命值：603 攻击力：95 防御力：49 冲击力：118 暴击率：5.0% 暴击伤害：50.0%');
  assert.deepEqual(segments.map(s => s.label), ['生命值', '攻击力', '防御力', '冲击力', '暴击率', '暴击伤害']);
  assert.deepEqual(segments.map(s => s.number), [603, 95, 49, 118, 5, 50]);
  assert.equal(segments[4].unit, '%');
  assert.equal(segments[0].unit, '');
  // 单条属性、纯文本、空输入都不算快照
  assert.equal(parseStatSegments('生命值：603').length, 1);
  assert.deepEqual(parseStatSegments('基础电击芯片×2、丁尼×2000'), []);
  assert.deepEqual(parseStatSegments(''), []);
  assert.deepEqual(parseStatSegments(undefined), []);
});

test('groupStatSegments：标签重复出现就切出「突破前 / 突破后」两组', () => {
  const one = groupStatSegments(parseStatSegments('生命值：1339 攻击力：143 防御力：109'));
  assert.equal(one.length, 1);
  assert.equal(one[0].length, 3);
  const two = groupStatSegments(
    parseStatSegments('生命值：1339 攻击力：143 防御力：109 生命值：1753 攻击力：177 防御力：143'),
  );
  assert.equal(two.length, 2);
  assert.deepEqual(two[0].map(s => s.number), [1339, 143, 109]);
  assert.deepEqual(two[1].map(s => s.number), [1753, 177, 143]);
  assert.deepEqual(groupStatSegments([]), []);
});

// zzz 代理人的「等级 | 项目 | 数据」三列表有三种形态，这段是属性快照（总计）那张。
const SNAPSHOT_LINES = [
  '| 等级 | 项目 | 数据 |',
  '| --- | --- | --- |',
  '| 总计 |  | 4初阶击破认证章32高阶击破认证章30破阵者认证章25 |',
  '| 初始 |  | 生命值：603 攻击力：95 防御力：49 冲击力：118 |',
  '| 10 |  | 生命值：1339 攻击力：143 防御力：109 生命值：1753 攻击力：177 防御力：143 |',
  '| 10 | 养成材料 | 初阶击破认证章×4、丁尼×24000 |',
  '| 满级 |  | 生命值：7500 攻击力：583 防御力：612 |',
  '| 满级 | 养成材料 | 特化击破认证章×60 |',
];

test('isStatSnapshotTable：项目列大面积为空 + 数据列整串属性', () => {
  const table = parseTable(SNAPSHOT_LINES);
  assert.equal(isStatSnapshotTable(table), true);
  // 真技能表（等级 1..N + 项目 伤害倍率）不能被误判
  const skill = parseTable([
    '| 等级 | 项目 | 数据 |',
    '| --- | --- | --- |',
    '| 1 | 伤害倍率 | 一段伤害倍率：31.2% 二段伤害倍率：33.7% |',
    '| 2 | 伤害倍率 | 一段伤害倍率：34.4% 二段伤害倍率：37.1% |',
  ]);
  assert.equal(isStatSnapshotTable(skill), false);
  // 两列表、空表都不算
  assert.equal(isStatSnapshotTable(parseTable(['| 等级 | 数值1 |', '| --- | --- |', '| 1 | 50% |'])), false);
  assert.equal(isStatSnapshotTable(null), false);
});

test('statSnapshotTableToLevels：总计单独拿、等级分组、材料归到同级', () => {
  const snapshot = statSnapshotTableToLevels(parseTable(SNAPSHOT_LINES));
  assert.deepEqual(snapshot.levels.map(l => l.level), ['初始', '10', '满级']);
  assert.match(snapshot.total, /^4初阶击破认证章32/);
  // 10 级是突破前 + 突破后两组
  assert.equal(snapshot.levels[1].stats.length, 2);
  assert.deepEqual(snapshot.levels[1].stats[0].map(s => s.number), [1339, 143, 109]);
  assert.deepEqual(snapshot.levels[1].stats[1].map(s => s.number), [1753, 177, 143]);
  assert.equal(snapshot.levels[1].materials, '初阶击破认证章×4、丁尼×24000');
  // 满级只有一组
  assert.equal(snapshot.levels[2].stats.length, 1);
  assert.deepEqual(snapshot.levels[2].stats[0].map(s => s.number), [7500, 583, 612]);
  // 非快照表返回空壳
  assert.deepEqual(statSnapshotTableToLevels(null), { levels: [], total: '' });
});

const RANK_LINES = [
  '| 等级 | 项目 | 数据 |',
  '| --- | --- | --- |',
  '| A | 强化效果 | 基础冲击力提升6点 失衡值提升37.3%。 |',
  '| A | 养成材料 | 高维数据：凶刑讣告×2 |',
  '| B | 强化效果 | 基础冲击力提升12点 失衡值提升42.6%。 |',
  '| F | 强化效果 | 基础冲击力提升36点 失衡值提升64%。 |',
  '| F | 养成材料 | 高维数据：凶刑讣告×5 |',
];

test('isRankTable：等级列是 A~F 单字母', () => {
  assert.equal(isRankTable(parseTable(RANK_LINES)), true);
  // 数字等级、混合等级都不算
  assert.equal(isRankTable(parseTable(['| 等级 | 项目 | 数据 |', '| --- | --- | --- |', '| 1 | 伤害倍率 | 31.2% |'])), false);
  assert.equal(isRankTable(parseTable(SNAPSHOT_LINES)), false);
  assert.equal(isRankTable(null), false);
});

test('rankTableToRows：A~F 逐级 + effect 末尾百分比 + 材料', () => {
  const rows = rankTableToRows(parseTable(RANK_LINES));
  assert.deepEqual(rows.map(r => r.rank), ['A', 'B', 'F']);
  // 取 effect 里最后一个百分比（前面的「提升6点」不是百分比，不能被抽中）
  assert.deepEqual(rows.map(r => r.percent), [37.3, 42.6, 64]);
  assert.equal(rows[0].materials, '高维数据：凶刑讣告×2');
  assert.match(rows[0].effect, /^基础冲击力提升6点/);
  assert.equal(rows[1].materials, '');
  assert.deepEqual(rankTableToRows(null), []);
});

test('splitMaterialRun：总计材料把粘连的「数字+名字」拆开', () => {
  const items = splitMaterialRun(
    '4初阶击破认证章32高阶击破认证章30破阵者认证章25基础电击芯片75进阶电击芯片250特化电击芯片60高维数据：凶刑讣告9腥风之握5「仓鼠笼」访问器300资深调查员记录370.5w丁尼',
  );
  assert.equal(items.length, 11);
  assert.deepEqual(items[0], { name: '初阶击破认证章', count: '4' });
  assert.deepEqual(items[6], { name: '高维数据：凶刑讣告', count: '60' });
  assert.deepEqual(items[10], { name: '丁尼', count: '370.5w' });
  // 正常形态（有 × 或 、分隔）不拆，交给调用方按纯文本渲染
  assert.deepEqual(splitMaterialRun('基础电击芯片×2、丁尼×2000'), []);
  assert.deepEqual(splitMaterialRun('特化击破认证章×60'), []);
  // 只有一条、或覆盖率不足的普通文本也不拆
  assert.deepEqual(splitMaterialRun('丁尼2000'), []);
  assert.deepEqual(splitMaterialRun(''), []);
  assert.deepEqual(splitMaterialRun(undefined), []);
});
