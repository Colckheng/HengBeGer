import fs from 'node:fs';
import {
  createGameKeeSource,
  findCategory,
  extractProfile,
  mapGkAgentFields,
  mapGkWeaponFields,
} from '../../scripts/crawler/sources/gamekee.js';
import { compareFields } from '../../scripts/crawler/compare.js';

const load = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/gamekee/${name}`, import.meta.url), 'utf8'));

describe('gamekee entry tree', () => {
  const tree = load('entry-list.json');

  test('findCategory resolves figure and weapon catalogs', () => {
    expect(findCategory(tree, ['角色图鉴', '角色']).id).toBe(148506);
    expect(findCategory(tree, ['音擎图鉴', '音擎']).id).toBe(153251);
    expect(findCategory(tree, ['角色图鉴', '不存在'])).toBeNull();
    expect(findCategory(tree, ['不存在'])).toBeNull();
  });

  test('treesByPid leaves carry content_id and icon', () => {
    const leaves = load('trees-pid-148506.json').data;
    expect(leaves.length).toBe(34);
    const leaf = leaves.find((x) => x.name === '安比·德玛拉');
    expect(leaf.content_id).toBe(621038);
    expect(leaf.icon).toContain('cdnimg-v2.gamekee.com');
  });
});

describe('gamekee profile extract', () => {
  test('agent profile strips icon-only attrs and image tokens', () => {
    const detail = load('detail-621038.json');
    const profile = extractProfile(detail.data.content_json);
    expect(profile.name).toBe('安比·德玛拉');
    expect(profile.desc.length).toBeGreaterThan(50);
    expect(profile.attrs['属性']).toBe('电属性');
    expect(profile.attrs['阵营']).toBe('狡兔屋');
    expect(profile.attrs['标签']).toBe('击破');
    expect(profile.attrs['稀有度']).toBeUndefined();
    expect(profile.images.length).toBe(1);
  });

  test('mapGkAgentFields maps to schema field names', () => {
    const profile = extractProfile(load('detail-621038.json').data.content_json);
    expect(mapGkAgentFields(profile)).toEqual({
      alias: '安比·德玛拉',
      阵营: '狡兔屋',
      属性: '电',
      特性: '击破',
    });
  });

  test('weapon profile exposes base attack', () => {
    const profile = extractProfile(load('detail-626263.json').data.content_json);
    expect(mapGkWeaponFields(profile)).toEqual({ alias: '深海访客', 基础攻击力: '713' });
  });

  test('extractProfile tolerates garbage input', () => {
    expect(extractProfile('not json')).toBeNull();
    expect(extractProfile([{ type: 'paragraph' }])).toBeNull();
    expect(extractProfile(null)).toBeNull();
  });
});

describe('gamekee source and pageList', () => {
  test('getPageList and detail go through fetcher json', async () => {
    const calls = [];
    const fetcher = {
      async getJson(url) {
        calls.push(url);
        if (url.includes('pageList')) return { code: 0, data: [{ id: 1, title: '攻略组招募' }] };
        if (url.includes('detail')) return { code: 0, data: { content_json: '[]' } };
        return { code: 0, data: [{ id: 5 }] };
      },
    };
    const src = createGameKeeSource(fetcher);
    expect(await src.getTreesByPid(7)).toEqual([{ id: 5 }]);
    const posts = await src.getPageList({ entryId: 148530, pageSize: 5 });
    expect(posts[0].title).toBe('攻略组招募');
    expect(await src.getContentDetail(621038)).toEqual({ content_json: '[]' });
    expect(calls[0]).toContain('treesByPid?pid=7');
    expect(calls[1]).toContain('pageList?entry_id=148530');
    expect(calls[2]).toContain('detail/621038');
  });

  test('fetcher requests carry game-id and www referer headers', async () => {
    let seen;
    const fetcher = {
      async getJson(url, req) {
        seen = req.headers;
        return { data: [] };
      },
    };
    const src = createGameKeeSource(fetcher, { gameId: 50270 });
    await src.getEntryList();
    expect(seen['game-id']).toBe('50270');
    expect(seen.Referer).toBe('https://www.gamekee.com/');
  });

  test('compareFields shared with bwiki style output', () => {
    const rows = compareFields({ 属性: '电' }, { 属性: '电', 特性: '击破' });
    expect(rows.map((r) => r.status)).toEqual(['match', 'source-only']);
  });
});
