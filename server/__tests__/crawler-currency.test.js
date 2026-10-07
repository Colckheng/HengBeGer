import {
  parseSeedTable,
  sectionText,
  stripCrawlTime,
  assignItems,
  assignByName,
  buildEntryDoc,
  refreshEntryFm,
  entryFilename,
  sourceUrl,
} from '../../scripts/crawler/currency-writer.js';
import { renderCurrencyDesc, normDesc } from '../../scripts/crawler/sources/nanoka.js';
import { validateFile } from '../../scripts/crawler/schema.js';

const ITEMS_TABLE = `# 装备图鉴

| #   | ID       | 名称         | English   | 类型   | 属性         | 描述 |
| --- | -------- | ------------ | --------- | ------ | ------------ | ---- |
| 2   | 99990    | 专家邀请函   | Expert    | Forge  | -            | 点击后开启。<br>该道具使用后消失。 |
| 30  | 350201   | 轮滑鞋       | Roller    | 装备   | 速度增幅 5%  | - |
`;

const AUGMENT_TABLE = `# 投资策略图鉴

| #   | 名称       | 品质      | 说明 |
| --- | ---------- | --------- | ---- |
| 1   | 特战资金   | Silver    | 进入首领节点时，获得7枚金币。 |
`;

const BUFF_TABLE = `# 投资环境图鉴

| #   | 名称     | 说明                     | 关联 |
| --- | -------- | ------------------------ | ---- |
| 1   | 火药味   | 开局时获得2个简易武装箱。 | 207  |
`;

describe('parseSeedTable', () => {
  test('parses data rows and skips header/separator/title', () => {
    const rows = parseSeedTable(ITEMS_TABLE);
    expect(rows).toHaveLength(2);
    expect(rows[0][2]).toBe('99990');
    expect(rows[0][3]).toBe('专家邀请函');
    expect(rows[1][6]).toBe('速度增幅 5%');
  });

  test('empty text yields no rows', () => {
    expect(parseSeedTable('')).toEqual([]);
  });
});

describe('sectionText', () => {
  const body = '# 标题\n\n**ID**：1\n\n## 效果\n\n第一行\n第二行\n\n## 属性\n\n速度增幅 5%\n';
  test('extracts section content', () => {
    expect(sectionText(body, '效果')).toBe('第一行\n第二行');
    expect(sectionText(body, '属性')).toBe('速度增幅 5%');
  });
  test('missing section returns empty', () => {
    expect(sectionText(body, '说明')).toBe('');
  });
});

describe('assignItems', () => {
  const source = { 99990: { name: '专家邀请函' }, 350201: { name: '轮滑鞋' } };
  test('matches rows by id across seasons', () => {
    const { assign, anomalies } = assignItems([{ season: 'season1', rows: parseSeedTable(ITEMS_TABLE) }], source);
    expect(anomalies).toEqual([]);
    expect(assign.get('99990').season).toBe('season1');
    expect(assign.get('350201').cells[6]).toBe('速度增幅 5%');
  });
  test('reports unmatched rows and unused source entries', () => {
    const { assign, anomalies } = assignItems([{ season: 'season2', rows: parseSeedTable(ITEMS_TABLE) }], {
      99990: source[99990],
      88888: { name: '种子缺失的物品' },
    });
    expect(assign.size).toBe(1);
    expect(anomalies.some((a) => a.includes('源条目未出现在种子'))).toBe(true);
    expect(anomalies.some((a) => a.includes('种子行未匹配到源条目'))).toBe(true);
  });
});

describe('assignByName', () => {
  const render = (e) => renderCurrencyDesc(e.desc, e.param_list);
  const source = {
    100101: { id: 100101, name: '特战资金', desc: '进入首领节点时，获得<unbreak>#1[i]</unbreak>枚金币。', param_list: [7] },
    100102: { id: 100102, name: '特战资金', desc: '进入首领节点时，获得<unbreak>#1[i]</unbreak>枚金币。', param_list: [9] },
  };
  test('disambiguates same-name entries by rendered desc', () => {
    const rows = [
      {
        season: 'season1',
        rows: [['', '1', '特战资金', 'Silver', '进入首领节点时，获得9i枚金币。']],
      },
      {
        season: 'season2',
        rows: [['', '1', '特战资金', 'Silver', '进入首领节点时，获得7i枚金币。']],
      },
    ];
    const { assign, anomalies } = assignByName(rows, source, {
      category: 'strategy',
      nameIdx: 2,
      descIdx: 4,
      renderDesc: render,
    });
    expect(anomalies).toEqual([]);
    expect(assign.get('100101').season).toBe('season2');
    expect(assign.get('100102').season).toBe('season1');
  });
  test('falls back to order when desc does not distinguish', () => {
    const rows = [
      {
        season: 'season1',
        rows: [['', '1', '特战资金', 'Silver', '完全不同的说明']],
      },
    ];
    const { assign } = assignByName(rows, source, {
      category: 'strategy',
      nameIdx: 2,
      descIdx: 4,
      renderDesc: render,
    });
    expect(assign.size).toBe(1);
    expect(assign.has('100101')).toBe(true);
  });
  test('reports source entries missing from seed', () => {
    const { anomalies } = assignByName([{ season: 'season1', rows: [] }], source, {
      category: 'strategy',
      nameIdx: 2,
      descIdx: 4,
      renderDesc: render,
    });
    expect(anomalies.some((a) => a.includes('未出现在种子'))).toBe(true);
  });
});

describe('buildEntryDoc', () => {
  const now = '2026-10-07T00:00:00.000Z';
  const version = '4.6.51';

  test('item doc has v1 fm keys, english preamble and effect/attr sections', () => {
    const entry = { name: '轮滑鞋', type: '装备', equip_category: 'Basic', desc: '佩戴后生效。' };
    const seedCells = ['', '30', '350201', '轮滑鞋', 'Roller Skates', '装备', '速度增幅 5%', '-'];
    const { fm, text } = buildEntryDoc('item', { id: '350201', entry, season: 'season1', seedCells, version, now });
    expect(fm).toMatchObject({
      game: 'currency',
      type: 'item',
      赛季: 'S1',
      id: 350201,
      name: '轮滑鞋',
      类型: '装备',
      稀有度: 'Basic',
      source: 'nanoka',
      version,
      last_crawled_at: now,
      image: '',
    });
    expect(fm.source_url).toBe(sourceUrl(version, 'item.json'));
    expect(text).toContain('> English name: Roller Skates');
    expect(text).toContain('## 效果');
    expect(text).toContain('## 属性');
    expect(text).toContain('速度增幅 5%');
    const v = validateFile(text);
    expect(v.errors).toEqual([]);
  });

  test('strategy doc maps quality to 类型 and renders desc with params', () => {
    const entry = { name: '特战资金', quality: 'Silver', desc: '获得<unbreak>#1[i]</unbreak>枚金币。', param_list: [7] };
    const { fm, text } = buildEntryDoc('strategy', { id: '100101', entry, season: 'season2', version, now });
    expect(fm).toMatchObject({ game: 'currency', type: 'strategy', 赛季: 'S2', 类型: 'Silver' });
    expect(text).toContain('## 说明');
    expect(text).toContain('获得7i枚金币。');
    const v = validateFile(text);
    expect(v.errors).toEqual([]);
  });

  test('environment doc carries 关联 in fm', () => {
    const entry = {
      name: '火药味',
      desc: '开局时获得#1个简易武装箱。',
      param_list: [2],
      bonus: { 40017: { combination_bonus_list: [207] } },
    };
    const { fm, text } = buildEntryDoc('environment', { id: '101', entry, season: 'season1', version, now });
    expect(fm['关联']).toBe('207');
    expect(text).toContain('开局时获得2个简易武装箱。');
    const v = validateFile(text);
    expect(v.errors).toEqual([]);
  });
});

describe('refreshEntryFm', () => {
  const now = '2026-10-07T00:00:00.000Z';
  test('overwrites crawl fields while preserving season and image', () => {
    const existing = {
      game: 'currency',
      type: 'item',
      tags: ['currency', 'item'],
      赛季: 'S1',
      id: 99990,
      name: '专家邀请函',
      source: 'nanoka-seed',
      image: 'currency/items/99990.png',
      英文备注: 'keep-me',
    };
    const entry = { name: '专家邀请函', type: 'Forge' };
    const merged = refreshEntryFm('item', { id: '99990', entry, season: 'season1', existingFm: existing, version: '4.6.51', now });
    expect(merged['source']).toBe('nanoka');
    expect(merged['赛季']).toBe('S1');
    expect(merged['image']).toBe('currency/items/99990.png');
    expect(merged['英文备注']).toBe('keep-me');
    expect(merged['last_crawled_at']).toBe(now);
    expect(merged['类型']).toBe('Forge');
  });
});

describe('entryFilename / sourceUrl', () => {
  test('sanitizes name and builds cdn url', () => {
    expect(entryFilename('99990', 'a/b:c')).toBe('99990_abc.md');
    expect(sourceUrl('4.6.51', 'item.json')).toBe('https://static.nanoka.cc/hsr/4.6.51/zh/currency/item.json');
  });
});

describe('normDesc roundtrip for seed desc', () => {
  test('normalizes br and literal escapes the same way', () => {
    expect(normDesc('点击后开启。<br>该道具使用后消失。')).toBe('点击后开启。\n该道具使用后消失。');
    expect(normDesc('第一行\\n第二行')).toBe('第一行\n第二行');
  });
});

describe('stripCrawlTime', () => {
  test('ignores last_crawled_at so reruns stay idempotent', () => {
    const a = '---\nname: "x"\nlast_crawled_at: "2026-10-07T10:42:02.238Z"\n---\n# x\n';
    const b = '---\nname: "x"\nlast_crawled_at: "2026-10-07T10:43:43.204Z"\n---\n# x\n';
    expect(stripCrawlTime(a)).toBe(stripCrawlTime(b));
    expect(stripCrawlTime(a)).toContain('last_crawled_at: -');
  });

  test('real content changes still differ after stripping', () => {
    const a = '---\nname: "x"\nlast_crawled_at: "2026-10-07T10:42:02.238Z"\n---\n# x\n旧值\n';
    const b = '---\nname: "y"\nlast_crawled_at: "2026-10-07T10:42:02.238Z"\n---\n# y\n新值\n';
    expect(stripCrawlTime(a)).not.toBe(stripCrawlTime(b));
  });
});
