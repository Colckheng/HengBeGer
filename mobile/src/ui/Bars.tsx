import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { isKeyValueTable, tableToKeyValues } from '../lib/sections';
import {
  computeScale,
  hasBars,
  isLevelSeries,
  isProjectTable,
  isRankTable,
  isStatSnapshotTable,
  numericRatio,
  projectTableToLevels,
  rankTableToRows,
  splitSegments,
  splitMaterialRun,
  statSnapshotTableToLevels,
  stripLabelPrefix,
  tableToSeries,
} from '../lib/values';

type Bar = { label: string; text: string; number: number | null; unit: string };
type Scale = { max: number; percent: boolean } | null;

/** 条形填充色：超过刻度（例如 >100%）用暖色，其余用主色。 */
function fillColor(value: number, scale: Scale) {
  if (scale && scale.percent && value > 100) return '#c98a3c';
  return '#6f5bd6';
}

function ratioOf(value: number, scale: Scale) {
  if (!scale || !scale.max) return 0;
  return Math.max(0.02, Math.min(1, Math.abs(value) / scale.max));
}

/**
 * 一条数值条形：可选左标签 + 轨道 + 值文本。
 * 刻度是百分比且最大值超过 100% 时，轨道上画一条 100% 参考线。
 */
export function ValueBarRow({ label, value, number, scale, labelWidth = 76 }: {
  label?: string;
  value: string;
  number: number | null;
  scale: Scale;
  labelWidth?: number;
}) {
  const ratio = number == null ? 0 : ratioOf(number, scale);
  const marker = scale && scale.percent && scale.max > 100 ? 100 / scale.max : null;
  return (
    <View style={styles.row}>
      {label ? <Text numberOfLines={1} style={[styles.rowLabel, { width: labelWidth }]}>{label}</Text> : null}
      <View style={styles.track}>
        {number != null ? (
          <View style={[styles.fill, { width: ((ratio * 100).toFixed(1) + '%') as any, backgroundColor: fillColor(number, scale) }]} />
        ) : null}
        {marker != null ? <View style={[styles.marker, { left: ((marker * 100).toFixed(1) + '%') as any }]} /> : null}
      </View>
      <Text numberOfLines={1} style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * 多列数值行（等级1 | 数值1 80% | 数值2 30%）：分组键单独一行，各列条形依次排在下面。
 */
export function ValueBarGroup({ title, bars, scale, labelWidth = 76 }: {
  title: string;
  bars: Bar[];
  scale: Scale;
  labelWidth?: number;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {bars.map((bar, index) => (
        <ValueBarRow
          key={bar.label + index}
          label={bar.number != null ? bar.label : undefined}
          value={bar.text}
          number={bar.number}
          scale={scale}
          labelWidth={labelWidth}
        />
      ))}
    </View>
  );
}


/**
 * 自绘滑轨的手势响应器。
 *
 * 父级是纵向 ScrollView：只声明 onStartShouldSetPanResponder 时，滚动容器会在 move 阶段
 * 把手势抢走，拖动看起来毫无反应（AVD 真机实测）。因此同时捕获 start 与 move，
 * 并拒绝 termination 请求。
 */
function makeSliderResponder({ widthRef, select, last }: {
  widthRef: { current: number };
  select: (value: number) => void;
  last: number;
}) {
  const pick = (locationX: number) => {
    const w = widthRef.current || 1;
    select((locationX / w) * last);
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => pick(event.nativeEvent.locationX),
    onPanResponderMove: (event) => pick(event.nativeEvent.locationX),
  });
}
/**
 * 拖动条：等级递增表用一根可拖的滑轨选等级，只显示当前等级那一行数值。
 *
 * 为什么自己写而不用 @react-native-community/slider：
 *   - 那是一个原生依赖，装完要重新 prebuild + 出包（这个项目每轮出包约 5 分钟），
 *     而 Expo 57 + RN 0.86 新架构下它的 autolink 兼容性没有保证；
 *   - 这里只需要「按百分比取整」这一种行为，PanResponder + onLayout 就够，零依赖零风险。
 */
export function LevelPicker({ series, scale }: { series: { key: string; bars?: Bar[] }[]; scale: Scale }) {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const indexRef = useRef(0);
  const last = series.length - 1;

  const select = (value: number) => {
    const next = Math.max(0, Math.min(last, Math.round(value)));
    if (next !== indexRef.current) {
      indexRef.current = next;
      setIndex(next);
    }
  };

  const responder = useMemo(() => makeSliderResponder({ widthRef, select, last }), [last]);

  const current = series[Math.min(index, last)] || series[0];
  const bars = current.bars || [];
  const ratio = last > 0 ? index / last : 0;

  return (
    <View style={styles.picker}>
      <View style={styles.pickerHead}>
        <Text style={styles.pickerKey}>{current.key}</Text>
        <Text style={styles.pickerHint}>拖动选择等级 · {index + 1}/{series.length}</Text>
      </View>
      <View
        style={styles.sliderHit}
        onLayout={(event) => {
          widthRef.current = event.nativeEvent.layout.width;
          setWidth(event.nativeEvent.layout.width);
        }}
        {...responder.panHandlers}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { width: ((ratio * 100).toFixed(1) + '%') as any }]} />
        <View style={[styles.sliderThumb, { left: Math.max(0, Math.min(width - 18, ratio * width - 9)) }]} />
      </View>
      <View style={styles.sliderTicks}>
        <Text style={styles.tickText}>{series[0].key}</Text>
        <Text style={styles.tickText}>{series[last].key}</Text>
      </View>
      <View style={styles.pickerValues}>
        {bars.map((bar, i) => (
          <ValueBarRow key={bar.label + i} label={bar.label} value={bar.text} number={bar.number} scale={scale} />
        ))}
      </View>
    </View>
  );
}


/**
 * zzz 代理人技能表：`| 等级 | 项目 | 数据 |`，一个等级有 2~3 个项目行，
 * 「数据」列还塞着多段数值（一段伤害倍率：31.2% 二段伤害倍率：33.7% ...）。
 *
 * 渲染策略：
 *   - 顶部一根拖动条选等级（复用 LevelPicker 的滑轨交互）；
 *   - 每个项目一张卡片；项目值是单值时画一条 bar，多段值则把每段拆成一条 bar
 *     （「一段 31.2% / 二段 33.7% / 三段 113.6% / 四段 239.1%」在同一个刻度上才看得出哪段最重）；
 *   - 没有数值的项目（养成材料）原样显示文本。
 * 刻度按当前等级的所有数值算 —— 等级越高倍率越大，切等级就能看到条形整体变长。
 */
export function ProjectLevelPicker({ levels }: { levels: ReturnType<typeof projectTableToLevels> }) {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const indexRef = useRef(0);
  const last = levels.length - 1;

  const select = (value: number) => {
    const next = Math.max(0, Math.min(last, Math.round(value)));
    if (next !== indexRef.current) {
      indexRef.current = next;
      setIndex(next);
    }
  };

  const responder = useMemo(() => makeSliderResponder({ widthRef, select, last }), [last]);

  const current = levels[Math.min(index, last)] || levels[0];

  // 每个项目一条或一组 bar，整屏共享一个刻度。
  const blocks = useMemo(() => {
    return current.items.map((item, itemIndex) => {
      const segments = splitSegments(item.text);
      return { item, itemIndex, segments };
    });
  }, [current]);

  const scale = useMemo(() => {
    const series: any[] = [];
    for (const block of blocks) {
      if (block.segments.length) {
        for (const seg of block.segments) series.push({ ...seg, key: seg.label });
      } else if (block.item.number != null) {
        series.push(block.item);
      }
    }
    return computeScale(series);
  }, [blocks]);

  const ratio = last > 0 ? index / last : 0;

  return (
    <View style={styles.picker}>
      <View style={styles.pickerHead}>
        <Text style={styles.pickerKey}>等级 {current.level}</Text>
        <Text style={styles.pickerHint}>拖动选择等级 · {index + 1}/{levels.length}</Text>
      </View>
      <View
        style={styles.sliderHit}
        onLayout={(event) => {
          widthRef.current = event.nativeEvent.layout.width;
          setWidth(event.nativeEvent.layout.width);
        }}
        {...responder.panHandlers}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { width: ((ratio * 100).toFixed(1) + '%') as any }]} />
        <View style={[styles.sliderThumb, { left: Math.max(0, Math.min(width - 18, ratio * width - 9)) }]} />
      </View>
      <View style={styles.sliderTicks}>
        <Text style={styles.tickText}>等级 {levels[0].level}</Text>
        <Text style={styles.tickText}>等级 {levels[last].level}</Text>
      </View>
      <View style={styles.pickerValues}>
        {blocks.map((block) => (
          <View key={block.item.label + block.itemIndex} style={styles.projectBlock}>
            <Text style={styles.projectLabel}>{block.item.label}</Text>
            {block.segments.length
              ? block.segments.map((seg, segIndex) => (
                <ValueBarRow key={seg.label + segIndex} label={seg.label} value={seg.text} number={seg.number} scale={scale} labelWidth={88} />
              ))
              : block.item.number != null
                ? <ValueBarRow value={stripLabelPrefix(block.item.text, block.item.label)} number={block.item.number} scale={scale} />
                : <Text style={styles.projectText}>{block.item.text}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}


/**
 * 材料文本：能拆成「名字 + 数量」的粘连串（总计材料）渲染成 chips，
 * 正常形态（`基础电击芯片×2、丁尼×2000`）原样走文本。
 */
export function MaterialRun({ text }: { text: string }) {
  const items = useMemo(() => splitMaterialRun(text), [text]);
  if (!items.length) return <Text style={styles.projectText}>{text}</Text>;
  return (
    <View style={styles.materialWrap}>
      {items.map((item) => (
        <View key={item.name} style={styles.materialChip}>
          <Text style={styles.materialName}>{item.name}</Text>
          <Text style={styles.materialCount}>{item.count}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * 属性快照：zzz 代理人「总计」表 —— 等级列是 初始/10/20/…/满级，项目列为空，
 * 数据列是 `生命值：603 攻击力：95 防御力：49 …` 一整串属性。
 *
 * 这类数据不能画条形：生命值 7500 和暴击率 5% 在同一根刻度上，百分比会被压成
 * 看不见的一条线。改成「等级滑轨 + 属性键值网格」：切等级看该级突破前/后的
 * 三围，材料单独一行。
 */
export function StatSnapshotPicker({ snapshot }: { snapshot: ReturnType<typeof statSnapshotTableToLevels> }) {
  const levels = snapshot.levels;
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const indexRef = useRef(0);
  const last = levels.length - 1;

  const select = (value: number) => {
    const next = Math.max(0, Math.min(last, Math.round(value)));
    if (next !== indexRef.current) {
      indexRef.current = next;
      setIndex(next);
    }
  };

  const responder = useMemo(() => makeSliderResponder({ widthRef, select, last }), [last]);

  const current = levels[Math.min(index, last)] || levels[0];
  const ratio = last > 0 ? index / last : 0;

  return (
    <View style={styles.picker}>
      <View style={styles.pickerHead}>
        <Text style={styles.pickerKey}>{current.level === '初始' ? '初始属性' : '等级 ' + current.level}</Text>
        <Text style={styles.pickerHint}>拖动选择等级 · {index + 1}/{levels.length}</Text>
      </View>
      <View
        style={styles.sliderHit}
        onLayout={(event) => {
          widthRef.current = event.nativeEvent.layout.width;
          setWidth(event.nativeEvent.layout.width);
        }}
        {...responder.panHandlers}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { width: ((ratio * 100).toFixed(1) + '%') as any }]} />
        <View style={[styles.sliderThumb, { left: Math.max(0, Math.min(width - 18, ratio * width - 9)) }]} />
      </View>
      <View style={styles.sliderTicks}>
        <Text style={styles.tickText}>{levels[0].level}</Text>
        <Text style={styles.tickText}>{levels[last].level}</Text>
      </View>
      {current.stats.map((group, groupIndex) => (
        <View key={groupIndex} style={styles.statGroup}>
          {groupIndex > 0 ? <Text style={styles.statCaption}>突破后</Text> : null}
          <View style={styles.statGrid}>
            {group.map((stat, statIndex) => (
              <View key={stat.label + statIndex} style={styles.statCell}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statValue}>{stat.text}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      {current.materials ? (
        <View style={styles.projectBlock}>
          <Text style={styles.projectLabel}>晋升材料</Text>
          <Text style={styles.projectText}>{current.materials}</Text>
        </View>
      ) : null}
      {snapshot.total ? (
        <View style={styles.projectBlock}>
          <Text style={styles.projectLabel}>总计材料</Text>
          <MaterialRun text={snapshot.total} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * 核心技 A~F 表：等级列是单字母（不是数字），项目列是 强化效果 / 养成材料。
 * 强化效果末尾的百分比（核心被动数值）抽出来画一条 A→F 递增的条形。
 */
export function RankTable({ rows }: { rows: ReturnType<typeof rankTableToRows> }) {
  const scale = useMemo(() => {
    const series = rows.filter(row => row.percent != null).map(row => ({ number: row.percent, unit: '%' }));
    return computeScale(series);
  }, [rows]);
  return (
    <View style={styles.group}>
      {rows.map((row) => (
        <View key={row.rank} style={styles.projectBlock}>
          <View style={styles.rankHead}>
            <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>{row.rank}</Text></View>
            {row.percent != null ? (
              <View style={styles.rankBar}>
                <ValueBarRow value={row.percent + '%'} number={row.percent} scale={scale} />
              </View>
            ) : null}
          </View>
          {row.effect ? <Text style={styles.projectText}>{row.effect}</Text> : null}
          {row.materials ? <Text style={styles.rankMaterials}>材料：{row.materials}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * 纯文本表：表头 + 数据行按列排开。
 *
 * 这些表（信赖奖励的三列长文本、推荐配装的槽位/主词条/备选词条、zzz 布谷布的
 * 公式形态数值）没有可比大小的数值，画条形只会丢掉文字；交给 Markdown 渲染
 * 又会把 | --- | 源码原样吐给读者（用户截图里的「裸 markdown」）。
 * 列数不多时等宽铺开、文字换行即可，列太多（>4）再退回 Markdown 避免挤成一团。
 */
export function TextTable({ table }: { table: any }) {
  const headers: string[] = table.headers || [];
  const rows: string[][] = table.rows || [];
  if (!rows.length) return null;
  const columnCount = Math.max(headers.length, ...rows.map(cells => cells.length));
  if (columnCount > 5) return null;
  const compact = columnCount >= 5;
  const cells = headers.length ? [headers, ...rows] : rows;
  return (
    <View style={styles.textTable}>
      {cells.map((line: string[], rowIndex: number) => (
        <View key={rowIndex} style={[styles.textRow, rowIndex === 0 && headers.length ? styles.textHeadRow : null]}>
          {Array.from({ length: columnCount }).map((_, columnIndex) => (
            <Text
              key={columnIndex}
              style={[
                styles.textCell,
                compact ? styles.textCellCompact : null,
                columnIndex === 0 ? styles.textCellKey : null,
                rowIndex === 0 && headers.length ? styles.textHeadCell : null,
              ]}
            >
              {line[columnIndex] ?? ''}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * 一张子表的渲染：
 *   - 等级型（等级1..N，N≥3）→ 拖动条选等级 + 当前等级数值条形（用户要的「拖动条」）；
 *   - 其余含数值的表 → 每行一条条形（两列）或分组条形（多列）；
 *   - 纯文本表 → 文本网格 / 键值行，绝不把 | --- | 源码丢给读者。
 */
export function SubTable({ table, markdownStyles, onLinkPress }: any) {
  const series = useMemo(() => tableToSeries(table), [table]);
  const scale = useMemo(() => computeScale(series), [series]);
  const drawable = useMemo(() => hasBars(series), [series]);

  const levels = useMemo(() => (isProjectTable(table) ? projectTableToLevels(table) : []), [table]);
  const numeric = useMemo(() => numericRatio(series), [series]);
  // 同为 | 等级 | 项目 | 数据 | 的三种表，形态完全不同，必须分派到不同渲染器：
  //   属性快照（等级=初始/10/…/满级，项目空，数据是整串属性）
  //   核心技（等级=A~F，项目=强化效果/养成材料）
  //   真技能表（等级=1..16，项目=伤害倍率/失衡倍率/养成材料）
  const snapshot = useMemo(
    () => (isStatSnapshotTable(table) ? statSnapshotTableToLevels(table) : null),
    [table],
  );
  const ranks = useMemo(() => (isRankTable(table) ? rankTableToRows(table) : []), [table]);

  if (!table) return null;
  if (snapshot && snapshot.levels.length >= 2) return <StatSnapshotPicker snapshot={snapshot} />;
  if (ranks.length >= 2) return <RankTable rows={ranks} />;
  // zzz 代理人技能表：| 等级 | 项目 | 数据 |，优先于普通两列/多列分支。
  if (levels.length >= 2) return <ProjectLevelPicker levels={levels} />;
  if (!series.length) return null;

  // 整张表都是空单元格（hsr 1507/1508 的残表：只有「等级1..4」、数值列全空）：
  // 画出来是一串空白行，直接不渲染。
  const hasContent = series.some((row: any) => {
    const items = row.bars ? row.bars : [row];
    return items.some((item: any) => item.number != null || String(item.text ?? '').trim());
  });
  if (!hasContent) {
    // 但「首列有名字、其余列全空」的表不能直接丢：hsr 晋阶的 `| 材料 | 数量 |`
    // 全库 679 张，数量列在源数据里就是空的，只剩材料名 —— 那是有效信息
    // （这个角色晋阶要哪些材料），排成一行比整段消失好。
    const names = series
      .map((row: any) => String(row.key ?? '').trim())
      .filter((name: string) => name && !/^(?:等级|Lv\.?)\s*\d+$/i.test(name));
    if (names.length < 2) return null;
    return (
      <View style={styles.projectBlock}>
        <Text style={styles.projectText}>{names.join('、')}</Text>
      </View>
    );
  }

  if (scale && drawable && isLevelSeries(series)) {
    return <LevelPicker series={series} scale={scale} />;
  }

  // 混着长文本列的表（掉落清单、名册、公式形态数值）画条形会整列丢字，
  // 只有数值占绝对多数时才画条形。
  if (scale && drawable && numeric >= 0.75) {
    return (
      <View style={styles.group}>
        {series.map((row: any, index: number) => {
          if (row.bars) {
            const bars = row.bars.filter((bar: any) => bar.number != null);
            if (!bars.length) return null;
            return <ValueBarGroup key={index} title={row.key} bars={bars} scale={scale} />;
          }
          // 抽不到数值的行（材料表的空「数量」列、纯文字说明）只走文本行，
          // 否则会画出一排没有填充的空轨道，白白占掉半屏。
          if (row.number == null) {
            if (!String(row.text || '').trim()) return null;
            return (
              <View key={index} style={styles.kvRow}>
                <Text numberOfLines={1} style={styles.kvKey}>{row.key}</Text>
                <Text style={styles.kvValue}>{row.text}</Text>
              </View>
            );
          }
          return (
            <ValueBarRow key={index} label={row.key} value={row.text} number={row.number} scale={scale} />
          );
        })}
      </View>
    );
  }

  // 没有可画数值：两列表退回键值行，其余排成文本网格。
  const values = isKeyValueTable(table) ? tableToKeyValues(table) : [];
  if (values.length > 0) {
    return (
      <View style={styles.kvTable}>
        {values.map((row: any, rowIndex: number) => (
          <View key={rowIndex} style={styles.kvRow}>
            <Text numberOfLines={1} style={styles.kvKey}>{row.key}</Text>
            <Text style={styles.kvValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    );
  }
  // 文本网格也放不下（>4 列）才退回 Markdown；即使如此也不再吐原始表格源码，
  // 改成每行「列名：值」的段落，读者至少看得懂。
  const grid = <TextTable table={table} />;
  if (grid) return grid;
  const lines = table.rows.slice(0, 20).map((cells: string[]) =>
    cells
      .map((cell: string, index: number) => {
        const name = (table.headers || [])[index];
        return name ? name + '：' + cell : cell;
      })
      .filter((part: string) => part.replace(/^[^：]*：/, '').trim())
      .join('　'),
  );
  if (table.rows.length > 20) lines.push('……还有 ' + (table.rows.length - 20) + ' 行未展示');
  return <Markdown style={markdownStyles} onLinkPress={onLinkPress}>{lines.join(String.fromCharCode(10))}</Markdown>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  rowLabel: { color: '#b9b1d4', fontSize: 11 },
  track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#241f3a', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  rowValue: { color: '#e7e2f5', fontSize: 12, minWidth: 52, textAlign: 'right' },
  group: { marginTop: 8 },
  groupTitle: { color: '#f2eefb', fontSize: 13, fontWeight: '700' },
  picker: { marginTop: 8 },
  pickerHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  pickerKey: { color: '#f2eefb', fontSize: 15, fontWeight: '700' },
  pickerHint: { color: '#9c93b8', fontSize: 11 },
  sliderHit: { height: 34, justifyContent: 'center', marginTop: 4 },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: '#241f3a' },
  sliderFill: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: '#6f5bd6' },
  sliderThumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#efe9ff' },
  sliderTicks: { flexDirection: 'row', justifyContent: 'space-between' },
  tickText: { color: '#6f6890', fontSize: 10 },
  pickerValues: { marginTop: 4 },
  projectBlock: { marginTop: 8 },
  statGroup: { marginTop: 6 },
  statCaption: { color: '#8b83a8', fontSize: 11, marginTop: 4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: { width: '30%', minWidth: 88, backgroundColor: '#191531', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  statLabel: { color: '#8b83a8', fontSize: 11 },
  statValue: { color: '#f2eefb', fontSize: 16, fontWeight: '700' },
  rankHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#4b3f8f', alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { color: '#efe9ff', fontSize: 12, fontWeight: '700' },
  rankBar: { flex: 1 },
  rankMaterials: { color: '#8b83a8', fontSize: 11, marginTop: 2 },
  materialWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  materialChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#191531', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  materialName: { color: '#c9c1e4', fontSize: 11 },
  materialCount: { color: '#f2eefb', fontSize: 12, fontWeight: '700' },
  projectLabel: { color: '#c9c1e4', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  projectText: { color: '#d7d0ee', fontSize: 13, lineHeight: 20 },
  textTable: { marginTop: 6 },
  textRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#1d1832' },
  textHeadRow: { borderTopWidth: 0, paddingTop: 0 },
  textCell: { flex: 1, color: '#d7d0ee', fontSize: 12, lineHeight: 18 },
  textCellCompact: { fontSize: 11, lineHeight: 16 },
  textCellKey: { flex: 0.9, color: '#c9c1e4' },
  textHeadCell: { color: '#8b83a8', fontSize: 11 },
  kvTable: { marginTop: 2 },
  kvRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#1d1832' },
  kvKey: { color: '#8b83a8', width: 76, fontSize: 13 },
  kvValue: { color: '#d7d0ee', flex: 1, fontSize: 13, lineHeight: 20 },
});