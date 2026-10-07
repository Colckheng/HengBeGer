import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFilters } from '../../scripts/crawler/sources/mihoyo.js';
import { transformZzzCharacter } from '../../scripts/crawler/transformers/zzz-character.js';
import { transformHsrCharacter } from '../../scripts/crawler/transformers/hsr-character.js';
import { transformGacha } from '../../scripts/crawler/transformers/gacha.js';
import {
  renderDoc,
  mergeBodies,
  mergeFm,
  findExistingFile,
  validateRendered,
  splitSections,
} from '../../scripts/crawler/writer.js';
import { stripHtml, cellText } from '../../scripts/crawler/html.js';

const load = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/mihoyo/${name}`, import.meta.url), 'utf8'));

function zzzListItem() {
  const list = load('zzz-list-43.json');
  const e = list.data.list[0].list.find((x) => x.content_id === 379);
  return { content_id: e.content_id, title: e.title, alias: e.alias_name || '', filters: parseFilters(e.ext) };
}

function hsrListItem() {
  const list = load('hsr-list-18.json');
  const e = list.data.list[0].list.find((x) => x.content_id === 48);
  return { content_id: e.content_id, title: e.title, alias: e.alias_name || '', filters: parseFilters(e.ext) };
}

describe('mihoyo zzz character transform', () => {
  const page = load('zzz-entry-379.json').data.page;
  const listItem = zzzListItem();

  test('produces a valid document', () => {
    const { fm, sections } = transformZzzCharacter({ page, listItem, localId: '379', now: new Date('2026-10-07T00:00:00Z') });
    const text = renderDoc(fm, sections, `# ${fm.name}`);
    const v = validateRendered(text);
    expect(v.errors).toEqual([]);
    expect(fm.game).toBe('zzz');
    expect(fm.type).toBe('character');
    expect(fm.特性).toBe('击破');
    expect(fm.属性).toBe('电');
    expect(fm.评级).toBe('A级');
    expect(fm.星级).toBe(4);
    expect(fm.name).toBe('安比');
    expect(fm.alias).toBe('安比·德玛拉');
    expect(fm.source).toBe('mihoyo-api');
    expect(fm.source_url).toContain('/379/');
  });

  test('renders skill growth and entity sections without junk', () => {
    const { fm, sections } = transformZzzCharacter({ page, listItem, localId: '379' });
    const text = renderDoc(fm, sections, `# ${fm.name}`);
    expect(text).toContain('31.2%');
    expect(text).toContain('基础电击芯片×2');
    expect(text).toContain('## 影画');
    expect(text).toContain('## 信赖奖励');
    expect(text).toContain('## 故事');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('wiki-note-text');
    expect(text).not.toContain('[详情]');
    expect(text).not.toMatch(/act-upload\.mihoyo\.com/);
    const heads = sections.map((s) => s.heading);
    expect(heads).toContain('## 技能');
    expect(heads).toContain('## 影画');
  });

  test('keeps existing seed name and panel stats through merge', () => {
    const existing = {
      name: '安比',
      生命值: 7500,
      冲击力: 136,
      tags: ['zzz', 'character'],
      image: 'zzz/agents/1011.png',
    };
    const { fm, sections } = transformZzzCharacter({ page, listItem, localId: '1011', existing });
    const merged = mergeFm(existing, fm);
    expect(merged.name).toBe('安比');
    expect(merged.alias).toBe('安比·德玛拉');
    expect(merged.生命值).toBe(7500);
    expect(merged.冲击力).toBe(136);
    expect(merged.image).toBe('zzz/agents/1011.png');
    expect(merged.特性).toBe('击破');
    expect(merged.source).toBe('mihoyo-api');
    const preamble = `# ${merged.name}`;
    const oldBody = `# 安比\n\n## 技能\n\n旧技能内容\n\n## 等级（Lv.60）\n\n| 项目 | 值 |\n| --- | --- |\n| 评级 | A级 |`;
    const body = mergeBodies(preamble, sections, oldBody);
    expect(body).not.toContain('旧技能内容');
    expect(body).toContain('## 等级（Lv.60）');
    expect(body).toContain('| 评级 | A级 |');
    const text = renderDoc(merged, [], body);
    const v = validateRendered(text);
    expect(v.errors).toEqual([]);
  });
});

describe('mihoyo hsr character transform', () => {
  const content = load('hsr-content-48.json').data.content;
  const listItem = hsrListItem();

  test('produces a valid document with filters and base stats', () => {
    const { fm, sections } = transformHsrCharacter({ content, listItem, localId: '1001', now: new Date('2026-10-07T00:00:00Z') });
    const text = renderDoc(fm, sections, `# ${fm.name}`);
    const v = validateRendered(text);
    expect(v.errors).toEqual([]);
    expect(fm.game).toBe('hsr');
    expect(fm.命途).toBe('存护');
    expect(fm.属性).toBe('冰');
    expect(fm.星级).toBe(4);
    expect(fm.基础生命值).toBeGreaterThan(0);
    expect(fm.name).toBe('三月七');
    expect(fm.source).toBe('mihoyo-api');
    expect(text).toContain('## 行迹');
    expect(text).toContain('## 星魂');
    expect(text).toContain('## 故事');
    expect(text).toContain('## 语音');
    expect(text).not.toContain('undefined');
    const trace = sections.find((s) => s.heading === '## 行迹');
    expect(trace.content).toContain('冻人的瞬间');
    expect(trace.content).toContain('削韧 20');
    expect(trace.content).not.toMatch(/^\| 数值1 \|$/m);
  });
});

describe('mihoyo gacha transform', () => {
  test('zzz pool renders UP table with resolved titles', () => {
    const pools = load('gacha-zzz.json').data.list;
    const pages = load('zzz-entry-pages-gacha.json').data.entry_pages;
    const titleMap = new Map(pages.map((p) => [Number(p.id), p.name]));
    const { fm, sections } = transformGacha({ game: 'zzz', pool: pools[0], titleMap, now: new Date('2026-10-07T00:00:00Z') });
    const text = renderDoc(fm, sections, `# ${fm.name}`);
    const v = validateRendered(text);
    expect(v.errors).toEqual([]);
    expect(fm.game).toBe('zzz');
    expect(fm.type).toBe('gacha');
    expect(fm.name).toBe('「红月初升」');
    expect(fm.start_time).toBe('2026-09-09 10:00:00');
    expect(text).toContain('克拉蕾·弗林特');
    expect(text).toContain('| 代理人 | S |');
  });

  test('hsr pool renders UP table with batch titles', () => {
    const pools = load('gacha-hsr.json').data.list;
    const batch = load('hsr-batch-gacha.json').data.list;
    const titleMap = new Map(batch.map((x) => [Number(x.content_id), x.title]));
    const { fm, sections } = transformGacha({ game: 'hsr', pool: pools[0], titleMap, now: new Date('2026-10-07T00:00:00Z') });
    const text = renderDoc(fm, sections, `# ${fm.name}`);
    const v = validateRendered(text);
    expect(v.errors).toEqual([]);
    expect(fm.game).toBe('hsr');
    expect(text).toContain('真珠');
    expect(text).toContain('7935');
  });
});

describe('writer merge helpers', () => {
  test('splitSections and mergeBodies replace by heading and keep others', () => {
    const oldBody = '# x\n\nintro\n\n## 技能\n\nold skill\n\n## 推荐配装\n\nkeep me';
    const { preamble, sections } = splitSections(oldBody);
    expect(preamble).toContain('# x');
    expect(sections.map((s) => s.heading)).toEqual(['## 技能', '## 推荐配装']);
    const merged = mergeBodies('# x', [{ heading: '## 技能', content: 'new skill' }], oldBody);
    expect(merged).toContain('new skill');
    expect(merged).not.toContain('old skill');
    expect(merged).toContain('## 推荐配装');
    expect(merged).toContain('keep me');
  });

  test('findExistingFile matches seed by normalized name tiers', () => {
    const dir = fileURLToPath(new URL('./fixtures/tmp-find/', import.meta.url));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '1011_安比.md'), '---\ngame: "zzz"\ntype: "character"\ntags: [zzz, character]\nid: "1011"\nname: "安比"\nsource: "nanoka"\nsource_url: "x"\nversion: "1"\nlast_crawled_at: "t"\nimage: "i"\n---\n\n# 安比\n', 'utf8');
    const hit = findExistingFile(dir, ['安比·德玛拉']);
    expect(hit).toBeTruthy();
    expect(hit.endsWith('1011_安比.md')).toBe(true);
    expect(findExistingFile(dir, ['完全没有的名字'])).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('html helpers', () => {
  test('stripHtml removes img tags, notes and junk entities', () => {
    const html = '点按<img src="https://x/y.png" />发动：<span style="color: rgb(1,2,3)">37.3%</span>。</p>\\" class=\\"wiki-note-text\\"><sup class="wiki-sup">[详情]</sup></span>';
    const out = stripHtml(html);
    expect(out).toBe('点按发动：37.3%。');
    expect(cellText('<p>a</p><p>b\tc</p>')).toBe('a b c');
  });
});
