import fs from 'node:fs';
import { parseBannerPayload, matchPoolVersion, createBittopupSource } from '../../scripts/crawler/sources/bittopup.js';
import { parseMonster, normRating } from '../../scripts/crawler/sources/appfeng.js';
import { parseCharacter as parseSrsCharacter, findSlug } from '../../scripts/crawler/sources/srs.js';
import { parseCharacter as parseZzzCharacter } from '../../scripts/crawler/sources/zzzgg.js';

const load = (site, name) => fs.readFileSync(new URL(`./fixtures/${site}/${name}`, import.meta.url), 'utf8');

describe('bittopup banner payload', () => {
  const banners = parseBannerPayload(load('bittopup', 'banner.html'));

  test('parses full version history from nuxt payload', () => {
    expect(banners.length).toBeGreaterThanOrEqual(30);
    expect(banners[0].version).toBe('4.6');
    expect(banners.map((b) => b.version)).toContain('1.0');
    expect(banners.every((b) => b.phases.length >= 1)).toBe(true);
  });

  test('phases carry halves, times and up items', () => {
    const v46 = banners.find((b) => b.version === '4.6');
    expect(v46.phases.length).toBe(2);
    expect(v46.phases[0].half).toBe('上半');
    expect(v46.phases[1].half).toBe('下半');
    expect(v46.phases[0].start).toContain('2026/09/28');
    const names = v46.phases[0].characters.map((c) => c.name);
    expect(names).toContain('真珠');
    expect(names).toContain('绯英');
    const lightcones = v46.phases[0].lightcones.map((c) => c.name);
    expect(lightcones).toContain('邂逅于下一个花季');
  });

  test('matchPoolVersion anchors by start day and up names', () => {
    expect(
      matchPoolVersion({ start: '2026-09-28 00:00:00', end: '2026-10-21 11:59:00', ups: ['绯英'] }, banners),
    ).toEqual({ version: '4.6', half: '上半' });
    expect(
      matchPoolVersion({ start: '2026-09-28 00:00:00', end: '2026-11-10 15:00:00', ups: ['真珠'] }, banners),
    ).toEqual({ version: '4.6', half: '上半' });
    expect(
      matchPoolVersion({ start: '2026-12-11 12:00:00', end: '2027-12-11 13:00:00', ups: ['Saber'] }, banners),
    ).toBeNull();
    expect(matchPoolVersion({ start: 'bad', end: '', ups: [] }, banners)).toBeNull();
  });

  test('payload parser tolerates garbage', () => {
    expect(parseBannerPayload('<html>no payload</html>')).toEqual([]);
    expect(parseBannerPayload('<script id="__NUXT_DATA__">not-json</script>')).toEqual([]);
  });

  test('source fetches banner page with referer', async () => {
    let seen;
    const fetcher = {
      async getText(url, req) {
        seen = { url, req };
        return '<html></html>';
      },
    };
    const src = createBittopupSource(fetcher);
    await src.getBannerPage();
    expect(seen.url).toContain('/zh-CN/starrail/banner');
    expect(seen.req.headers.Referer).toContain('wiki.bittopup.com');
  });
});

describe('appfeng monster parse', () => {
  test('extracts core fields from detail page', () => {
    const m = parseMonster(load('appfeng', 'monster-5012120.html'));
    expect(m.alias).toBe('「合金保姆」');
    expect(m['阵营']).toBe('其他');
    expect(m['评级']).toBe('Minion Lv.2');
    expect(m['弱点']).toBe('火 / 雷 / 虚数');
  });

  test('normRating maps category names to schema values', () => {
    expect(normRating('小怪Lv2')).toBe('Minion Lv.2');
    expect(normRating('小怪')).toBe('Minion');
    expect(normRating('精英')).toBe('Elite');
    expect(normRating('小BOSS')).toBe('Little Boss');
    expect(normRating('大BOSS')).toBe('Big Boss');
    expect(normRating('未知型')).toBe('未知型');
  });
});

describe('srs character parse', () => {
  test('extracts name, rarity, element and path from inline json', () => {
    const c = parseSrsCharacter(load('srs', 'character-mar7th.html'));
    expect(c).toEqual({ alias: '三月七', 星级: 4, 属性: '冰', 命途: '存护' });
  });

  test('findSlug resolves exact match with path disambiguation', () => {
    const list = load('srs', 'characters.html');
    expect(findSlug(list, '三月七')).toBe('mar7th');
    expect(findSlug(list, '三月七', '存护')).toBe('mar7th');
    expect(findSlug(list, '三月七', '巡猎')).toBe('mar7th2');
    expect(findSlug(list, '银狼')).toBe('silverwolf');
    expect(findSlug(list, '不存在的角色')).toBeNull();
    expect(findSlug(list, '')).toBeNull();
  });
});

describe('zzz.gg character parse', () => {
  test('extracts alias, faction, element and role', () => {
    const c = parseZzzCharacter(load('zzzgg', 'character-nagi.html'));
    expect(c).toEqual({ alias: '猫又', 阵营: '狡兔屋', 属性: '物理', 特性: '强攻' });
  });

  test('parser tolerates pages without profile blocks', () => {
    expect(parseZzzCharacter('<html><h1>x</h1></html>')).toEqual({ alias: 'x' });
  });
});
