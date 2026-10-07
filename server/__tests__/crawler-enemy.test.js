import { enemySourceUrl, refreshEnemyFm, syncBossBodyDates } from '../../scripts/crawler/enemy-writer.js';
import { renderDoc } from '../../scripts/crawler/writer.js';
import { validateFile } from '../../scripts/crawler/schema.js';

const NOW = '2026-10-07T00:00:00.000Z';
const VER = '3.3.4+19304006';

const MONSTER_FM = {
  game: 'zzz',
  type: 'monster',
  tags: ['zzz', 'monster'],
  id: 10000,
  name: '提尔锋',
  阵营: '以太异形',
  评级: 'C',
  弱点: '冰、以太',
  生命值: 60709,
  攻击力: 609,
  防御力: 571,
  冲击力: 1002,
  source: 'nanoka-seed',
  image: 'zzz/enemies/10000.png',
};

const MONSTER_BODY = `# 提尔锋

**以太异形 | C | ID 10000**

## 成长属性（等级 70）

| 项目   | 值     |
| ------ | ------ |
| 生命值 | 60,709 |
| 攻击力 | 609    |
`;

const BOSS_BODY = `# 危局强袭战 69001

**赛季 ID: 69001 · 试炼 · 2024-12-20 04:00:00 ~ 2025-01-10**

## Boss生命值

档位范围 1 ~ 29 · 默认 Lv.29
`;

describe('enemySourceUrl', () => {
  test('builds zzz cdn url for boss list and monster detail', () => {
    expect(enemySourceUrl(VER, 'boss.json')).toBe(`https://static.nanoka.cc/zzz/${VER}/boss.json`);
    expect(enemySourceUrl(VER, 'zh/monster/10000.json')).toBe(`https://static.nanoka.cc/zzz/${VER}/zh/monster/10000.json`);
  });
});

describe('refreshEnemyFm', () => {
  test('overwrites stats and stamps crawl fields while preserving image and type keys', () => {
    const merged = refreshEnemyFm({
      existingFm: MONSTER_FM,
      fields: { id: 10000, name: '提尔锋', 阵营: '以太异形', 评级: 'C', 弱点: '冰、火', 生命值: 70000 },
      sourceUrl: enemySourceUrl(VER, 'zh/monster/10000.json'),
      version: VER,
      now: NOW,
    });
    expect(merged.source).toBe('nanoka');
    expect(merged.source_url).toBe(`https://static.nanoka.cc/zzz/${VER}/zh/monster/10000.json`);
    expect(merged.version).toBe(VER);
    expect(merged.last_crawled_at).toBe(NOW);
    expect(merged['生命值']).toBe(70000);
    expect(merged['攻击力']).toBe(609);
    expect(merged['弱点']).toBe('冰、火');
    expect(merged.image).toBe('zzz/enemies/10000.png');
    expect(merged.tags).toEqual(['zzz', 'monster']);
    expect(merged.type).toBe('monster');
    expect(merged.id).toBe(10000);
  });

  test('drops empty source fields instead of blanking existing values', () => {
    const merged = refreshEnemyFm({
      existingFm: { id: 69001, name: '试炼', source: 'nanoka-seed' },
      fields: { name: undefined, 阵营: null, 评级: '' },
      sourceUrl: enemySourceUrl(VER, 'boss.json'),
      version: VER,
      now: NOW,
    });
    expect(merged.name).toBe('试炼');
    expect(merged['阵营']).toBeUndefined();
    expect(merged['评级']).toBeUndefined();
    expect(Object.keys(merged)).toEqual(['id', 'name', 'source', 'source_url', 'version', 'last_crawled_at']);
  });
});

describe('refreshEnemyFm rendered output', () => {
  test('monster doc passes validateFile with v1 required keys', () => {
    const merged = refreshEnemyFm({
      existingFm: MONSTER_FM,
      fields: { 生命值: 60709 },
      sourceUrl: enemySourceUrl(VER, 'zh/monster/10000.json'),
      version: VER,
      now: NOW,
    });
    const text = renderDoc(merged, [], MONSTER_BODY);
    const v = validateFile(text);
    expect(v.errors).toEqual([]);
    expect(text).toContain('## 成长属性（等级 70）');
    expect(text).toContain('| 生命值 | 60,709 |');
  });

  test('boss doc validates with warning for faction keys absent in source', () => {
    const merged = refreshEnemyFm({
      existingFm: { game: 'zzz', type: 'boss', tags: ['zzz', 'boss'], id: 69001, name: '试炼', source: 'nanoka-seed' },
      fields: { name: '试炼' },
      sourceUrl: enemySourceUrl(VER, 'boss.json'),
      version: VER,
      now: NOW,
    });
    const text = renderDoc(merged, [], BOSS_BODY);
    const v = validateFile(text);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toContain('missing type key: 阵营');
    expect(v.warnings).toContain('missing type key: 评级');
  });
});

describe('syncBossBodyDates', () => {
  test('replaces the first date range and keeps the rest of the body', () => {
    const out = syncBossBodyDates(BOSS_BODY, { 开始: '2025-03-01 04:00:00', 结束: '2025-03-15' });
    expect(out).toContain('**赛季 ID: 69001 · 试炼 · 2025-03-01 04:00:00 ~ 2025-03-15**');
    expect(out).toContain('# 危局强袭战 69001');
    expect(out).toContain('档位范围 1 ~ 29 · 默认 Lv.29');
    expect(out).not.toContain('2024-12-20');
  });

  test('same dates produce identical body', () => {
    expect(syncBossBodyDates(BOSS_BODY, { 开始: '2024-12-20 04:00:00', 结束: '2025-01-10' })).toBe(BOSS_BODY);
  });

  test('body without a date range is left untouched', () => {
    const plain = '# 危局强袭战 69001\n\n没有日期的正文。\n';
    expect(syncBossBodyDates(plain, { 开始: '2025-03-01 04:00:00', 结束: '2025-03-15' })).toBe(plain);
  });

  test('missing fields leave body untouched', () => {
    expect(syncBossBodyDates(BOSS_BODY, { 开始: '', 结束: '' })).toBe(BOSS_BODY);
    expect(syncBossBodyDates(BOSS_BODY, {})).toBe(BOSS_BODY);
  });
});
