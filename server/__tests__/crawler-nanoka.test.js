import fs from 'node:fs';
import {
  parseVersion,
  RARITY_GRADE,
  fmtPct,
  renderCurrencyDesc,
  normDesc,
  parseCurrencyRole,
  parseCurrencyTrait,
  parseCurrencyItem,
  parseCurrencyAugment,
  parseCurrencyBuff,
  parseZzzMonster,
  parseZzzBoss,
  renderHsrSkillParams,
  parseHsrSkillTables,
  parseZzzSkillSource,
  zzzSkillValueAt,
  parseZzzAgentSkill,
} from '../../scripts/crawler/sources/nanoka.js';

const load = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/nanoka/${name}`, import.meta.url), 'utf8'));
const loadText = (name) => fs.readFileSync(new URL(`./fixtures/nanoka/${name}`, import.meta.url), 'utf8');

describe('nanoka version detection', () => {
  test('parses version from embedded static urls', () => {
    expect(parseVersion(loadText('hsr-version.html'), 'hsr')).toBe('4.6.51');
    expect(parseVersion(loadText('zzz-version.html'), 'zzz')).toBe('3.3.4+19304006');
  });

  test('picks the most frequent version segment', () => {
    const html = 'static.nanoka.cc/hsr/1.0.0/a.json static.nanoka.cc/hsr/4.6.51/b.json static.nanoka.cc/hsr/4.6.51/c.json';
    expect(parseVersion(html, 'hsr')).toBe('4.6.51');
    expect(parseVersion('nothing here', 'hsr')).toBeNull();
  });
});

describe('nanoka currency parsers', () => {
  const roles = load('hsr-4.6.51-zh-currency-role.json');
  const traits = load('hsr-4.6.51-zh-currency-trait.json');

  test('role 1001 maps rarity and traits to seed fields', () => {
    expect(parseCurrencyRole(roles['1001'], traits)).toEqual({
      name: '三月七',
      id: 1001,
      站位: '后排',
      治疗护盾: '护盾',
      星阶: 1,
      星级: 1,
      特性: '列车同行、护盾',
    });
  });

  test('role 1004 maps Front and Healer', () => {
    const out = parseCurrencyRole(roles['1004'], traits);
    expect(out.站位).toBe('前排');
    expect(out.治疗护盾).toBe('治疗');
    expect(out.星阶).toBe(5);
    expect(out.特性).toBe('列车同行、星间旅人、减益');
  });

  test('role 1005 maps Both to 前后排', () => {
    const out = parseCurrencyRole(roles['1005'], traits);
    expect(out.站位).toBe('前后排');
    expect(out.星阶).toBe(2);
    expect(out.特性).toBe('星核猎手、持续伤害');
  });

  test('trait keeps id and name only', () => {
    expect(parseCurrencyTrait(traits['1001'])).toEqual({ name: '列车同行', id: 1001 });
  });

  test('item 99990 renders description like the seed table', () => {
    const items = load('hsr-4.6.51-zh-currency-item.json');
    expect(parseCurrencyItem(items['99990'])).toEqual({
      名称: '专家邀请函',
      类型: 'Forge',
      描述: '点击后开启专家邀请函，从至多四名【专家顾问】或【金币】中选择一个获得。\n该道具使用后消失。',
    });
  });

  test('augment 300101 renders #N[i] with literal i suffix', () => {
    const augments = load('hsr-4.6.51-zh-currency-augment.json');
    expect(parseCurrencyAugment(augments['300101'])).toEqual({
      名称: '开源节流',
      品质: 'Prismatic',
      说明: '获得10i金币，利息上限提升至9i。进入新节点时，如果上个节点你没有花费金币，则可获得最大利息的金币数。',
    });
  });

  test('buff 101 renders plain #1 and combination bonus 关联', () => {
    const buffs = load('hsr-4.6.51-zh-currency-buff.json');
    expect(parseCurrencyBuff(buffs['101'])).toEqual({
      名称: '火药味',
      说明: '开局时获得2个简易武装箱。',
      关联: '207',
    });
  });

  test('renderCurrencyDesc strips tags and formats placeholders', () => {
    expect(renderCurrencyDesc('获得<unbreak>#1[i]</unbreak>金币', [10])).toBe('获得10i金币');
    expect(renderCurrencyDesc('<color=a>#1</color>个箱子', [2])).toBe('2个箱子');
    expect(renderCurrencyDesc('概率#1[f]%', [1.5])).toBe('概率1.5%');
    expect(renderCurrencyDesc('触发#1次', [3])).toBe('触发3次');
  });

  test('fmtPct converts fractions to percent', () => {
    expect(fmtPct(0.38)).toBe('38%');
    expect(fmtPct(0.5)).toBe('50%');
    expect(fmtPct(1.5)).toBe('150%');
  });

  test('normDesc converts br tags to newlines', () => {
    expect(normDesc('前<br>后')).toBe('前\n后');
    expect(normDesc(' a<br/>b ')).toBe('a\nb');
    expect(normDesc('前\\n后')).toBe('前\n后');
  });
});

describe('nanoka zzz enemy parsers', () => {
  test('monster 10000 matches the seed doc exactly', () => {
    const detail = load('zzz-detail-monster-10000.json');
    expect(parseZzzMonster(detail)).toEqual({
      id: 10000,
      name: '提尔锋',
      阵营: '以太异形',
      评级: 'C',
      弱点: '冰、以太',
      生命值: 60709,
      攻击力: 609,
      防御力: 571,
      冲击力: 1002,
    });
  });

  test('rarity grade mapping covers zzz monster tiers', () => {
    expect(RARITY_GRADE[1]).toBe('C');
    expect(RARITY_GRADE[2]).toBe('B');
    expect(RARITY_GRADE[3]).toBe('A');
    expect(RARITY_GRADE[4]).toBe('S');
  });

  test('boss 69001 keeps id as given and slices live_end date', () => {
    const list = load('zzz-3.3.4-boss.json');
    expect(parseZzzBoss(list['69001'], '69001')).toEqual({
      id: '69001',
      name: '试炼',
      开始: '2024-12-20 04:00:00',
      结束: '2025-01-10',
    });
  });
});

describe('nanoka skill parsers', () => {
  const detail = load('hsr-detail-character-1001.json');

  test('renderHsrSkillParams follows desc occurrence order', () => {
    expect(renderHsrSkillParams(detail.skills['100101'], '1')).toEqual(['50%']);
    expect(renderHsrSkillParams(detail.skills['100102'], '1').slice(0, 2)).toEqual(['38%', '190']);
    expect(renderHsrSkillParams(detail.skills['100103'], '1')[0]).toBe('90%');
    expect(renderHsrSkillParams(detail.skills['100104'], '1')).toEqual(['50%', '2']);
  });

  test('parseHsrSkillTables reads seed trace tables', () => {
    const tables = parseHsrSkillTables(loadText('hsr-character-1001-skills.md'));
    expect(tables['极寒的弓矢'].type).toBe('普攻');
    expect(tables['极寒的弓矢'].max).toBe(7);
    expect(tables['极寒的弓矢'].levels[0].cells).toEqual(['50%']);
    expect(tables['可爱即是正义'].max).toBe(12);
    expect(tables['可爱即是正义'].levels[0].cells).toEqual(['38%', '190']);
    expect(tables['冰刻箭雨之时'].max).toBe(12);
    expect(tables['冰刻箭雨之时'].levels[0].cells).toEqual(['90%', '30%']);
    expect(tables['少女的特权'].max).toBe(12);
    expect(tables['纯洁'].type).toBe('额外能力');
    expect(tables['纯洁'].levels).toEqual([]);
  });

  test('parseZzzSkillSource reads basic attack growth block', () => {
    const zzz = load('zzz-detail-character-1011.json');
    expect(parseZzzSkillSource(zzz)).toEqual({
      name: '普通攻击：伏特速攻',
      damage: 3120,
      damageGrowth: 290,
      stun: 1560,
      stunGrowth: 80,
    });
  });

  test('zzzSkillValueAt is linear in level', () => {
    expect(zzzSkillValueAt(3120, 290, 1)).toBe(3120);
    expect(zzzSkillValueAt(3120, 290, 2)).toBe(3410);
    expect(zzzSkillValueAt(3120, 290, 16)).toBe(7470);
    expect(zzzSkillValueAt(1560, 80, 1)).toBe(1560);
  });

  test('parseZzzAgentSkill reads the first damage run of the seed table', () => {
    expect(parseZzzAgentSkill(loadText('zzz-agent-1011-skills.md'))).toEqual({
      max: 16,
      lv1: '31.2%',
      lv2: '34.1%',
      lvLast: '74.7%',
      stunLv1: '15.6%',
    });
  });
});
