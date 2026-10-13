import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

import { createCatalogRouter } from '../catalog.js';
import {
  buildEntry,
  buildGroups,
  buildIndex,
  buildSections,
  CATEGORIES,
  cleanBody,
  createEntryLookup,
  deriveIssues,
  displayName,
  ISSUE_DYNAMIC_REF,
  ISSUE_LV80,
  ISSUE_SIX_STAR,
  ISSUE_SNAPSHOT,
  ISSUE_UNNAMED,
  parsePayload,
  resolveEntryKey,
  resolveGeneratedAt,
  safeName,
  sha256Hex,
} from '../openIndex.js';

const entryLink = (label, key) => `[${label}](entry:${key})`;

describe('openIndex safeName / displayName', () => {
  it('strips unbreak and every other tag and rewrites the nickname placeholder', () => {
    expect(safeName('<unbreak>开拓者</unbreak>')).toBe('开拓者');
    expect(safeName('<color=#fff>姬子</color>')).toBe('姬子');
    expect(safeName('三月七<i>·</i>四星光锥')).toBe('三月七·四星光锥');
    expect(safeName('{NICKNAME}')).toBe('开拓者（原名待核验）');
    expect(safeName('<UNBREAK>花火</UNBREAK>')).toBe('花火');
  });

  it('renders the placeholder for unconfirmed source names only', () => {
    // The frozen regex only matches the bare 'OfficialName_' token, so a name
    // carrying an id suffix (as the crawler writes it) is left untouched.
    expect(displayName('OfficialName_', '1001')).toBe('名称待补充 · 1001');
    expect(displayName('未命名', '2002')).toBe('名称待补充 · 2002');
    expect(displayName('OfficialName_1001', '1001')).toBe('OfficialName_1001');
    expect(displayName('OfficialName1001', '1001')).toBe('OfficialName1001');
    expect(displayName('昔涟', '1415')).toBe('昔涟');
    expect(displayName('<unbreak>安比</unbreak>', '1011')).toBe('安比');
  });
});

describe('openIndex parsePayload', () => {
  it('accepts parsed objects, JSON strings and empty values', () => {
    expect(parsePayload({ a: 1 })).toEqual({ a: 1 });
    expect(parsePayload('{"a":1}')).toEqual({ a: 1 });
    expect(parsePayload('not json')).toEqual({});
    expect(parsePayload(null)).toEqual({});
    expect(parsePayload(undefined)).toEqual({});
  });
});

describe('openIndex resolveEntryKey', () => {
  it('maps zzz characters to agents and other types through the alias table', () => {
    expect(resolveEntryKey('zzz/agents', 'character', '1011')).toBe('zzz/agents/1011');
    expect(resolveEntryKey('hsr/characters', 'lightcone', '23052')).toBe('hsr/light_cones/23052');
    expect(resolveEntryKey('hsr/characters', 'relicset', '101')).toBe('hsr/relics/101');
    expect(resolveEntryKey('zzz/agents', 'weapon', '14102')).toBe('zzz/sound_engines/14102');
    expect(resolveEntryKey('zzz/agents', 'equipment', '31000')).toBe('zzz/drive_disks/31000');
    expect(resolveEntryKey('zzz/agents', 'monster', '1001')).toBe('zzz/enemies/1001');
  });

  it('keeps the season segment for currency categories and falls back to the raw type', () => {
    expect(resolveEntryKey('currency/season2/roles', 'role', '151122')).toBe('currency/season2/roles/151122');
    expect(resolveEntryKey('currency/season1/strategies', 'augment', '9')).toBe('currency/season1/strategies/9');
    expect(resolveEntryKey('hsr/characters', 'mystery', '5')).toBe('hsr/mystery/5');
  });

  it('resolves through a key lookup and misses cleanly', () => {
    const lookup = createEntryLookup([
      { key: 'hsr/light_cones/23052', name: '爱如此刻永恒', id: '23052' },
    ]);
    expect(lookup('hsr/characters', 'lightcone', '23052')).toEqual({
      key: 'hsr/light_cones/23052',
      name: '爱如此刻永恒',
      id: '23052',
    });
    expect(lookup('hsr/characters', 'lightcone', '99999')).toBeNull();
    expect(lookup('hsr/characters', undefined, undefined)).toBeNull();
  });
});

describe('openIndex deriveIssues', () => {
  const base = { key: 'hsr/characters/1415', category: 'hsr/characters', body: '正文', fields: {} };

  it('adds nothing for clean payloads', () => {
    expect(deriveIssues(base, '昔涟')).toEqual([]);
  });

  it('derives the level notice for hsr enemies with a level field', () => {
    expect(deriveIssues({ ...base, category: 'hsr/enemies', fields: { 属性等级: 80 } }, '某敌')).toEqual([ISSUE_LV80]);
    expect(deriveIssues({ ...base, category: 'hsr/enemies', fields: {} }, '某敌')).toEqual([]);
  });

  it('derives the six-star notice for the one known key only', () => {
    expect(deriveIssues({ ...base, key: 'currency/season2/roles/151122' }, '星神★阿哈')).toEqual([ISSUE_SIX_STAR]);
    expect(deriveIssues({ ...base, key: 'currency/season2/roles/151123' }, '星神★阿哈')).toEqual([]);
  });

  it('derives the dynamic-reference notice from the raw body', () => {
    expect(deriveIssues({ ...base, body: '<gridfightinfo type="monster" id="1">' }, '某敌')).toEqual([ISSUE_DYNAMIC_REF]);
    expect(deriveIssues({ ...base, body: '伤害 100i 点' }, '某敌')).toEqual([ISSUE_DYNAMIC_REF]);
    expect(deriveIssues({ ...base, body: '伤害 100 点' }, '某敌')).toEqual([]);
  });

  it('derives the unnamed notice from the raw name and the snapshot notice for gacha', () => {
    expect(deriveIssues(base, 'OfficialName_1415')).toEqual([ISSUE_UNNAMED]);
    expect(deriveIssues(base, '未命名')).toEqual([ISSUE_UNNAMED]);
    expect(deriveIssues(base, '{NICKNAME}')).toEqual([ISSUE_UNNAMED]);
    expect(deriveIssues({ ...base, category: 'hsr/gacha' }, '跃迁')).toEqual([ISSUE_SNAPSHOT]);
  });

  it('keeps the frozen rule order', () => {
    const payload = {
      key: 'hsr/enemies/1',
      category: 'hsr/enemies',
      fields: { 属性等级: 80 },
      body: '<gridfightinfo type="monster" id="1">',
    };
    expect(deriveIssues(payload, '未命名')).toEqual([ISSUE_LV80, ISSUE_DYNAMIC_REF, ISSUE_UNNAMED]);
  });
});

describe('openIndex cleanBody', () => {
  const lookup = createEntryLookup([
    { key: 'hsr/light_cones/23052', name: '爱如此刻永恒', id: '23052' },
  ]);
  const payload = { category: 'hsr/characters', body: '' };

  it('turns paired gridfightinfo blocks into entry links', () => {
    expect(cleanBody({ ...payload, body: 'A<gridfightinfo type="lightcone" id="23052">x</gridfightinfo>B' }, lookup))
      .toBe(`A${entryLink('爱如此刻永恒', 'hsr/light_cones/23052')}B`);
  });

  it('handles a stray opening tag and unresolved references', () => {
    expect(cleanBody({ ...payload, body: 'A<gridfightinfo type="lightcone" id="23052">B' }, lookup))
      .toBe(`A${entryLink('爱如此刻永恒', 'hsr/light_cones/23052')}B`);
    expect(cleanBody({ ...payload, body: 'A<gridfightinfo type="monster" id="7">' }, lookup))
      .toBe('A关联资料 #7（待解析）');
    expect(cleanBody({ ...payload, body: 'A<gridfightinfo type="monster">' }, lookup))
      .toBe('A关联资料（待解析）');
  });

  it('strips inline markup and converts line breaks', () => {
    expect(cleanBody({ ...payload, body: '<unbreak>a</unbreak><i>b</i><b>c</b><color #fff>d</color>' }, lookup))
      .toBe('abcd');
    // Frozen behaviour: the tag regex needs whitespace before attributes, so
    // '<color=#fff>' survives, exactly as it does in public/demo-data.
    expect(cleanBody({ ...payload, body: '<color=#fff>d</color>' }, lookup)).toBe('<color=#fff>d');
    expect(cleanBody({ ...payload, body: 'x<br>y<br/>z' }, lookup)).toBe('x\ny\nz');
  });

  it('rewrites relative markdown links and degrades unresolved labels', () => {
    expect(cleanBody({ ...payload, body: '见 [爱如此刻永恒](../lightcone/23052.md)' }, lookup))
      .toBe(`见 ${entryLink('爱如此刻永恒', 'hsr/light_cones/23052')}`);
    expect(cleanBody({ ...payload, body: '见 [<unbreak>某标签</unbreak>](../monster/9.md)' }, lookup))
      .toBe('见 某标签');
  });

  it('tolerates a missing body', () => {
    expect(cleanBody({}, lookup)).toBe('');
    expect(cleanBody(null, lookup)).toBe('');
  });
});

describe('openIndex buildSections', () => {
  it('splits on level-2 headings, drops the title line and numbers sections', () => {
    const sections = buildSections('# 昔涟\n\n## 角色信息\n\na\n\n## 晋阶\n\nb\n');
    expect(sections).toEqual([
      { id: 'section-0', title: '角色信息', body: '\na\n\n' },
      { id: 'section-1', title: '晋阶', body: '\nb\n\n' },
    ]);
  });

  it('labels leading content 概述 and drops empty sections', () => {
    expect(buildSections('lead\n\n## 空段\n\n## 有内容\n\ny\n')).toEqual([
      { id: 'section-0', title: '概述', body: 'lead\n\n' },
      { id: 'section-1', title: '有内容', body: '\ny\n\n' },
    ]);
  });

  it('returns nothing for an empty body', () => {
    expect(buildSections('')).toEqual([]);
    expect(buildSections(null)).toEqual([]);
  });
});

describe('openIndex buildIndex', () => {
  const rows = [
    {
      key: 'hsr/characters/1415',
      category: 'hsr/characters',
      name: '昔涟',
      payload: {
        key: 'hsr/characters/1415',
        id: '1415',
        category: 'hsr/characters',
        name: '昔涟',
        fields: { 属性等级: 80, last_crawled_at: '2026-10-07T11:54:47.358Z' },
        issues: [],
        imageHash: 'a'.repeat(64),
      },
    },
    {
      key: 'hsr/characters/1001',
      category: 'hsr/characters',
      name: '未命名',
      payload: {
        key: 'hsr/characters/1001',
        id: '1001',
        category: 'hsr/characters',
        name: '未命名',
        fields: { last_crawled_at: '2026-10-08T07:58:42.198Z' },
        issues: ['暂无可用图片'],
        imageHash: 'b'.repeat(64),
      },
    },
    {
      key: 'zzz/agents/1011',
      category: 'zzz/agents',
      name: '安比',
      payload: {
        key: 'zzz/agents/1011',
        id: '1011',
        category: 'zzz/agents',
        name: '安比',
        fields: {},
        issues: [],
        imageHash: null,
      },
    },
  ];

  it('orders items by category then key and fills groups from CATEGORIES', () => {
    const index = buildIndex(rows, new Set(['a'.repeat(64)]));
    expect(index.treeHash).toBeNull();
    expect(index.groups).toHaveLength(23);
    expect(index.items.map(item => item.key)).toEqual([
      'hsr/characters/1001',
      'hsr/characters/1415',
      'zzz/agents/1011',
    ]);

    const hsr = index.groups.find(group => group.id === 'hsr/characters');
    expect(hsr).toEqual({ id: 'hsr/characters', name: '星铁 · 角色', total: 2, count: 2 });
    expect(index.groups.find(group => group.id === 'zzz/agents').count).toBe(1);
    expect(index.groups.reduce((sum, group) => sum + group.count, 0)).toBe(3);
    expect(index.groups.filter(group => group.count === 0)).toHaveLength(21);
  });

  it('only exposes image URLs that have a stored asset and encodes detailFile', () => {
    const index = buildIndex(rows, new Set(['a'.repeat(64)]));
    const [unnamed, cyrene, anby] = index.items;
    expect(unnamed.image).toBeNull();
    expect(cyrene.image).toBe(`/api/catalog/images/${'a'.repeat(64)}`);
    expect(anby.image).toBeNull();
    expect(cyrene.detailFile).toBe('/api/catalog/entry?key=hsr%2Fcharacters%2F1415');
    expect(anby.detailFile).toBe('/api/catalog/entry?key=zzz%2Fagents%2F1011');
  });

  it('keeps rawName, merges derived issues and takes the newest crawl stamp', () => {
    const index = buildIndex(rows, new Set());
    expect(index.generatedAt).toBe('2026-10-08T07:58:42.198Z');
    expect(index.items[0].name).toBe('名称待补充 · 1001');
    expect(index.items[0].rawName).toBe('未命名');
    expect(index.items[0].issues).toEqual(['暂无可用图片', ISSUE_UNNAMED]);
    expect(index.items[1].issues).toEqual([]);
    expect(index.items[1].sourceCheck).toBeNull();

    const enemy = buildIndex([{
      key: 'hsr/enemies/1',
      category: 'hsr/enemies',
      name: '某敌',
      payload: { key: 'hsr/enemies/1', id: '1', category: 'hsr/enemies', name: '某敌', fields: { 属性等级: 80 }, issues: [] },
    }], new Set());
    expect(enemy.items[0].issues).toEqual([ISSUE_LV80]);
  });

  it('falls back to the supplied timestamp when no payload carries one', () => {
    expect(buildIndex([{ key: 'a/1', category: 'zzz/agents', name: 'A', payload: { category: 'zzz/agents', name: 'A' } }], new Set(), 'FALLBACK'))
      .toMatchObject({ generatedAt: 'FALLBACK', treeHash: null });
    expect(resolveGeneratedAt([], 'FALLBACK')).toBe('FALLBACK');
    expect(resolveGeneratedAt([{ payload: { fields: { last_crawled_at: 'not-a-date' } } }], 'FALLBACK')).toBe('FALLBACK');
  });

  it('ignores payload timestamps that parse worse than a later row', () => {
    const rowsWithTimes = [
      { payload: { fields: { last_crawled_at: '2026-01-01T00:00:00.000Z' } } },
      { payload: { fields: { last_crawled_at: '2026-10-08T07:58:42.198Z' } } },
      { payload: { fields: { last_crawled_at: '2025-12-31T23:59:59.000Z' } } },
    ];
    expect(resolveGeneratedAt(rowsWithTimes, 'FALLBACK')).toBe('2026-10-08T07:58:42.198Z');
  });

  it('counts groups from raw rows when payloads are strings', () => {
    const stringRows = [{ key: 'zzz/agents/1', category: 'zzz/agents', name: 'A', payload: '{"category":"zzz/agents","name":"A","id":"1"}' }];
    expect(buildGroups(stringRows).find(group => group.id === 'zzz/agents')).toEqual({
      id: 'zzz/agents',
      name: '绝区零 · 代理人',
      total: 1,
      count: 1,
    });
  });
});

describe('openIndex buildEntry', () => {
  it('returns the item shape plus cleaned sections and body', () => {
    const row = {
      key: 'hsr/characters/1415',
      category: 'hsr/characters',
      name: '昔涟',
      payload: {
        key: 'hsr/characters/1415',
        id: '1415',
        category: 'hsr/characters',
        name: '昔涟',
        fields: {},
        issues: [],
        imageHash: null,
        body: '# 昔涟\n\n## 角色信息\n\n见 [爱如此刻永恒](../lightcone/23052.md)\n',
      },
    };
    const lookup = createEntryLookup([{ key: 'hsr/light_cones/23052', name: '爱如此刻永恒', id: '23052' }]);
    const entry = buildEntry(row, new Set(), lookup);

    expect(entry.name).toBe('昔涟');
    expect(entry.body).toBe(`# 昔涟\n\n## 角色信息\n\n见 ${entryLink('爱如此刻永恒', 'hsr/light_cones/23052')}\n`);
    expect(entry.body).not.toContain('../');
    expect(entry.sections).toEqual([
      { id: 'section-0', title: '角色信息', body: `\n见 ${entryLink('爱如此刻永恒', 'hsr/light_cones/23052')}\n\n` },
    ]);
    expect(entry.detailFile).toBe('/api/catalog/entry?key=hsr%2Fcharacters%2F1415');
  });
});

describe('openIndex CATEGORIES', () => {
  it('lists the 23 categories in the frozen order', () => {
    expect(Object.keys(CATEGORIES)).toEqual([
      'zzz/agents', 'zzz/sound_engines', 'zzz/drive_disks', 'zzz/bangboo', 'zzz/enemies', 'zzz/gacha', 'zzz/formula',
      'hsr/characters', 'hsr/light_cones', 'hsr/relics', 'hsr/enemies', 'hsr/gacha', 'hsr/formula',
      'currency/season1/roles', 'currency/season1/traits', 'currency/season1/items', 'currency/season1/strategies', 'currency/season1/environments',
      'currency/season2/roles', 'currency/season2/traits', 'currency/season2/items', 'currency/season2/strategies', 'currency/season2/environments',
    ]);
    expect(CATEGORIES['zzz/agents']).toBe('绝区零 · 代理人');
    expect(CATEGORIES['hsr/characters']).toBe('星铁 · 角色');
    expect(CATEGORIES['currency/season2/strategies']).toBe('货币战争 S2 · 投资策略');
  });

  it('keeps representative labels in the API contract', () => {
    expect(CATEGORIES['zzz/agents']).toBe('绝区零 · 代理人');
    expect(CATEGORIES['hsr/characters']).toBe('星铁 · 角色');
    expect(CATEGORIES['currency/season2/strategies']).toBe('货币战争 S2 · 投资策略');
  });
});

describe('openIndex sha256Hex', () => {
  it('matches the node crypto digest used for catalog assets', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

const buildRouterApp = query => {
  const app = express();
  app.use('/api/catalog', createCatalogRouter({ query }));
  return app;
};

const routerRows = [
  {
    key: 'hsr/characters/1415',
    category: 'hsr/characters',
    name: '昔涟',
    payload: {
      key: 'hsr/characters/1415',
      id: '1415',
      category: 'hsr/characters',
      name: '昔涟',
      fields: {},
      issues: [],
      imageHash: 'c'.repeat(64),
      body: '## 角色信息\n\n正文\n',
    },
  },
];

describe('catalog router open index routes', () => {
  const query = jest.fn(async sql => {
    if (sql.includes('catalog_assets')) return [[{ hash: 'c'.repeat(64) }]];
    if (sql.includes('catalog_entries')) return [routerRows];
    return [[]];
  });

  it('serves /index with the frozen envelope and a private cache header', async () => {
    const res = await request(buildRouterApp(query)).get('/api/catalog/index');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    expect(res.body.treeHash).toBeNull();
    expect(res.body.groups).toHaveLength(23);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].detailFile).toBe('/api/catalog/entry?key=hsr%2Fcharacters%2F1415');
    expect(res.body.items[0].image).toBe(`/api/catalog/images/${'c'.repeat(64)}`);
  });

  it('serves /entry with sections and body and rejects unknown keys', async () => {
    const app = buildRouterApp(query);
    const found = await request(app).get('/api/catalog/entry').query({ key: 'hsr/characters/1415' });
    expect(found.status).toBe(200);
    expect(found.body.sections).toEqual([{ id: 'section-0', title: '角色信息', body: '\n正文\n\n' }]);
    expect(found.body.body).toBe('## 角色信息\n\n正文\n');

    const missing = await request(buildRouterApp(jest.fn(async () => [[]]))).get('/api/catalog/entry').query({ key: 'nope' });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: '未找到条目' });
  });

  it('answers 503 when the catalog tables are missing', async () => {
    const failing = jest.fn(async () => {
      throw Object.assign(new Error('Table catalog_entries does not exist'), { code: 'ER_NO_SUCH_TABLE' });
    });
    const res = await request(buildRouterApp(failing)).get('/api/catalog/entry').query({ key: 'hsr/characters/1415' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: '资料库尚未导入，请完成数据同步。' });
  });
});
