import { load } from 'js-yaml';

export const COMMON_KEYS = [
  'game',
  'type',
  'id',
  'name',
  'tags',
  'source',
  'source_url',
  'version',
  'last_crawled_at',
];

export const TYPE_RULES = {
  'zzz/character': ['特性', '属性', '攻击方式', '阵营', '评级', '星级', '生命值', '攻击力', '防御力', '冲击力'],
  'zzz/weapon': ['特性', '稀有度', '星级', '基础攻击力', '副词条类型', '副词条数值', '技能名'],
  'zzz/equipment': ['稀有度'],
  'zzz/bangboo': ['稀有度', '星级', '生命值', '攻击力', '防御力', '冲击力'],
  'zzz/monster': ['阵营', '评级', '弱点'],
  'zzz/boss': ['阵营', '评级'],
  'zzz/formula': ['标题'],
  'hsr/character': ['命途', '属性', '星级', '阵营', '基础生命值', '基础攻击力', '基础防御力', '基础速度'],
  'hsr/lightcone': ['命途', '星级', '基础生命值', '基础攻击力', '基础防御力'],
  'hsr/relic': ['类型'],
  'hsr/monster': ['阵营', '评级', '弱点'],
  'hsr/formula': ['标题'],
  'hsr/role': ['赛季', '星阶', '星级', '站位', '特性', '治疗护盾'],
  'hsr/trait': ['赛季', '成员数'],
  'currency/item': ['赛季', '类型'],
  'currency/strategy': ['赛季', '类型'],
  'currency/environment': ['赛季', '类型'],
  'zzz/gacha': ['start_time', 'end_time'],
  'hsr/gacha': ['start_time', 'end_time'],
};

export function splitFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: null, body: text, error: 'missing front-matter block' };
  let data;
  try {
    data = load(m[1]);
  } catch (err) {
    return { data: null, body: text, error: `front-matter YAML error: ${err.message}` };
  }
  if (!data || typeof data !== 'object') return { data: null, body: text, error: 'front-matter is not a mapping' };
  return { data, body: text.slice(m[0].length), error: null };
}

export function validateFrontMatter(data, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!data) return { errors: ['no front-matter data'], warnings };
  for (const key of COMMON_KEYS) {
    if (data[key] === undefined || data[key] === null || data[key] === '') {
      if (key === 'image') warnings.push('missing image (pending image collector)');
      else errors.push(`missing required key: ${key}`);
    }
  }
  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    errors.push('tags must be an array');
  }
  const game = data.game;
  const type = data.type;
  if (typeof game === 'string' && typeof type === 'string') {
    if (!['zzz', 'hsr', 'currency'].includes(game)) errors.push(`invalid game: ${game}`);
    const rules = TYPE_RULES[`${game}/${type}`];
    if (!rules) {
      warnings.push(`no type rules registered: ${game}/${type}`);
    } else if (!opts.skipTypeRules) {
      for (const key of rules) {
        if (data[key] === undefined || data[key] === null || data[key] === '') {
          warnings.push(`missing type key: ${key}`);
        }
      }
    }
  }
  return { errors, warnings };
}

export function validateTableConsistency(body) {
  const errors = [];
  const lines = body.split(/\r?\n/);
  let expected = null;
  let blockStart = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cols = line.trim().split('|').length - 2;
      if (expected === null) {
        expected = cols;
        blockStart = i + 1;
      } else if (cols !== expected) {
        errors.push(`table row ${i + 1} has ${cols} columns, expected ${expected} (block at line ${blockStart})`);
      }
    } else {
      expected = null;
    }
  }
  return { errors };
}

export function validateFile(text, opts = {}) {
  const { data, body, error } = splitFrontMatter(text);
  if (error) return { errors: [error], warnings: [], data: null };
  const fm = validateFrontMatter(data, opts);
  const tables = opts.skipTables ? { errors: [] } : validateTableConsistency(body);
  return { errors: [...fm.errors, ...tables.errors], warnings: fm.warnings, data, body };
}

export default { COMMON_KEYS, TYPE_RULES, splitFrontMatter, validateFrontMatter, validateTableConsistency, validateFile };
