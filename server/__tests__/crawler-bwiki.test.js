import fs from 'node:fs';
import {
  createBwikiSource,
  parseInfobox,
  mapZzzFields,
  mapHsrFields,
  compareFields,
  parseGachaPeriods,
  matchGachaPeriod,
  endDate,
} from '../../scripts/crawler/sources/bwiki.js';

const loadHtml = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/bwiki/${name}`, import.meta.url), 'utf8')).parse.text['*'];

describe('bwiki infobox parse', () => {
  test('zzz agent infobox pairs keys with values', () => {
    const infobox = parseInfobox(loadHtml('bwiki-zzz-anby.html'));
    expect(infobox['全名/本名']).toBe('安比·德玛拉（Anby Demara）');
    expect(infobox['阵营']).toBe('狡兔屋');
    expect(infobox['属性']).toBe('电');
    expect(infobox['特性']).toBe('击破');
    expect(infobox['伤害类型']).toBe('斩击');
  });

  test('sr character infobox resolves through redirect page', () => {
    const infobox = parseInfobox(loadHtml('bwiki-sr-march-guard.html'));
    expect(infobox['命途']).toBe('存护命途');
    expect(infobox['战斗属性']).toBe('冰战斗属性');
    expect(infobox['阵营']).toBe('星穹列车');
  });

  test('mapZzzFields strips english suffix and maps attack type', () => {
    const fields = mapZzzFields(parseInfobox(loadHtml('bwiki-zzz-anby.html')));
    expect(fields).toEqual({
      alias: '安比·德玛拉',
      阵营: '狡兔屋',
      属性: '电',
      特性: '击破',
      攻击方式: '斩击',
    });
  });

  test('mapHsrFields strips path and battle-attribute suffixes', () => {
    const fields = mapHsrFields(parseInfobox(loadHtml('bwiki-sr-march-guard.html')));
    expect(fields).toEqual({
      命途: '存护',
      属性: '冰',
      阵营: '星穹列车',
    });
  });
});

describe('bwiki compareFields', () => {
  test('classifies match diff data-only source-only', () => {
    const rows = compareFields(
      { alias: '安比·德玛拉', 阵营: '狡兔屋', 属性: '电' },
      { alias: '安比', 阵营: '狡兔屋', 特性: '击破' },
    );
    expect(rows).toEqual([
      { field: 'alias', data: '安比·德玛拉', source: '安比', status: 'diff' },
      { field: '阵营', data: '狡兔屋', source: '狡兔屋', status: 'match' },
      { field: '属性', data: '电', source: '', status: 'data-only' },
      { field: '特性', data: '', source: '击破', status: 'source-only' },
    ]);
  });

  test('empty on both sides is marked empty', () => {
    expect(compareFields({ x: '' }, { x: '' })[0].status).toBe('empty');
  });
});

describe('bwiki gacha periods', () => {
  const periods = parseGachaPeriods(loadHtml('bwiki-zzz-gacha.html'));

  test('parses both colspan-title and plain two-column tables', () => {
    expect(periods.length).toBeGreaterThanOrEqual(100);
    for (const p of periods) {
      expect(p.time).toBeTruthy();
      expect(p.version).toBeTruthy();
    }
    const versions = new Set(periods.map((p) => p.version));
    expect(versions).toContain('3.2下半');
    expect(versions).toContain('3.2上半');
    expect(versions).toContain('1.0上半');
    expect(versions.size).toBeGreaterThanOrEqual(30);
  });

  test('fuzzy start times from both new and old table shapes', () => {
    const fuzzyNew = periods.find((p) => p.time.includes('3.2版本更新后') && p.version === '3.2上半');
    expect(fuzzyNew).toBeTruthy();
    const fuzzyOld = periods.find((p) => p.time.includes('公测开启后') && p.version === '1.0上半');
    expect(fuzzyOld).toBeTruthy();
  });

  test('matchGachaPeriod matches by end date and rejects unknown', () => {
    const m1 = matchGachaPeriod('2026-09-09 10:00:00', '2026-09-30 11:59:00', periods);
    expect(m1).toBeTruthy();
    expect(m1.version).toBe('3.2上半');
    const m2 = matchGachaPeriod('2026-09-30 12:00:00', '2026-10-20 14:59:59', periods);
    expect(m2).toBeTruthy();
    expect(m2.version).toBe('3.2下半');
    expect(matchGachaPeriod('2020-01-01 00:00:00', '2020-01-02 00:00:00', periods)).toBeNull();
  });

  test('endDate normalizes slashes and truncates', () => {
    expect(endDate('2026/09/30 11:59:59')).toBe('2026-09-30');
    expect(endDate('2026-09-30 11:59:00')).toBe('2026-09-30');
    expect(endDate('3.2版本更新后')).toBe('');
  });
});

describe('bwiki getPage', () => {
  function mockFetcher(responses) {
    let i = 0;
    return {
      async getJson() {
        const r = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return r;
      },
    };
  }

  const loadJson = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/bwiki/${name}`, import.meta.url), 'utf8'));

  test('returns parse text for direct page', async () => {
    const src = createBwikiSource(mockFetcher([loadJson('bwiki-zzz-anby.html')]));
    const { html, title } = await src.getPage('zzz', '安比');
    expect(title).toBe('安比');
    expect(html).toContain('mw-parser-output');
    expect(html).not.toContain('redirectMsg');
  });

  test('follows redirect to canonical title', async () => {
    const src = createBwikiSource(mockFetcher([loadJson('bwiki-sr-march.html'), loadJson('bwiki-sr-march-guard.html')]));
    const { html, title } = await src.getPage('sr', '三月七');
    expect(title).toBe('三月七•存护');
    expect(html).toContain('mw-parser-output');
    expect(html).not.toContain('redirectMsg');
  });
});
