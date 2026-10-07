import { splitFrontMatter, validateFile, validateFrontMatter, validateTableConsistency } from '../../scripts/crawler/schema.js';

const validDoc = `---
game: "zzz"
type: "character"
tags: [zzz, character]
id: 1011
name: "安比"
特性: "击破"
属性: "电"
攻击方式: "斩击"
阵营: "狡兔屋"
评级: "A级"
星级: 4
生命值: 7500
攻击力: 658
防御力: 612
冲击力: 136
source: "mihoyo-api"
source_url: "https://example.com/1011"
version: "3.3.4"
last_crawled_at: "2026-10-06T00:00:00Z"
image: "zzz/agents/1011.png"
---

# 安比

| 项目 | 值 |
| ---- | - |
| 1 | a |
| 2 | b |
`;

describe('crawler schema', () => {
  test('splits front-matter and body', () => {
    const { data, body, error } = splitFrontMatter(validDoc);
    expect(error).toBeNull();
    expect(data.id).toBe(1011);
    expect(data.tags).toEqual(['zzz', 'character']);
    expect(body.trim().startsWith('# 安比')).toBe(true);
  });

  test('missing front-matter block reports error', () => {
    const { data, error } = splitFrontMatter('# no fm');
    expect(data).toBeNull();
    expect(error).toContain('missing front-matter');
  });

  test('valid v1 document passes with no errors', () => {
    const result = validateFile(validDoc);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('missing required common key is an error', () => {
    const { data } = splitFrontMatter(validDoc);
    delete data.source_url;
    const { errors } = validateFrontMatter(data);
    expect(errors).toContain('missing required key: source_url');
  });

  test('missing type key is a warning', () => {
    const { data } = splitFrontMatter(validDoc);
    delete data.特性;
    const { errors, warnings } = validateFrontMatter(data);
    expect(errors).toEqual([]);
    expect(warnings).toContain('missing type key: 特性');
  });

  test('tags must be an array', () => {
    const { data } = splitFrontMatter(validDoc);
    data.tags = 'zzz';
    const { errors } = validateFrontMatter(data);
    expect(errors).toContain('tags must be an array');
  });

  test('inconsistent table columns are an error', () => {
    const body = '| a | b |\n| - | - |\n| 1 |\n';
    const { errors } = validateTableConsistency(body);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('has 1 columns, expected 2');
  });

  test('unregistered type yields warning not error', () => {
    const { data } = splitFrontMatter(validDoc);
    data.type = 'mystery';
    const { errors, warnings } = validateFrontMatter(data);
    expect(errors).toEqual([]);
    expect(warnings[0]).toContain('no type rules registered');
  });
});
