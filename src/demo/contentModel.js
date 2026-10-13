// Keep source sections intact. Presentation metadata must not rewrite game data.
export const SECTION_GROUPS = ['概览', '战斗', '养成', '配装', '故事', '机制', '来源'];

export function hasMeaningfulMarkdown(body = '') {
  const content = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]{0,3}#{1,6}(?:[ \t].*)?$/gm, '')
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:[-*+] |\d+[.)] |> ?)/gm, '')
    .replace(/[*_`~\s]/g, '');
  // A named image/link or a formula is content, even without a prose paragraph.
  return /[\p{L}\p{N}]/u.test(content);
}

function groupFor(title, category = '') {
  if (/补充核验|来源/.test(title)) return '来源';
  if (category.endsWith('/formula')) return '机制';
  if (/推荐|配队|配装/.test(title)) return '配装';
  if (/故事|语音|关系|画廊|考据|印象|CV|配音|留言|信赖/.test(title)) return '故事';
  if (/材料|素材|晋阶|突破|育成|成长|总属性/.test(title)) return '养成';
  if (/技能|行迹|影画|星魂|被动|能力|效果|精炼|星阶/.test(title)) return '战斗';
  return '概览';
}

function shortTitleFor(section, sections, category) {
  const title = section.title;
  if (title === '概述' && category?.endsWith('/traits')) return '羁绊效果';
  if (title === '行迹') return '技能详解';
  if (title === '技能' && sections.some(s => s.title === '行迹')) return '技能参数';
  if (/属性快照/.test(title)) return '属性与计算口径';
  if (/^基础数值/.test(title)) return '基础数值';
  if (/^技能材料/.test(title)) return '技能材料';
  if (/^晋阶材料/.test(title)) return '晋阶材料';
  if (/^突破素材/.test(title)) return '突破素材';
  if (/^总育成素材/.test(title)) return '育成总览';
  if (/^光锥效果/.test(title)) return '光锥效果';
  if (/^核心被动/.test(title)) return '核心被动';
  if (/^成长属性/.test(title)) return '成长属性';
  if (/^突破属性/.test(title)) return '突破属性';
  if (/^技能（/.test(title)) return '技能';
  return title.replace(/^\d+(?:\.\d+)*\s*/, '').replace(/[「」]/g, '');
}

export function prepareSections(p) {
  const source = (p.sections || []).filter(s => hasMeaningfulMarkdown(s.body));
  const sections = source.map(section => {
    const supplementary = section.title === '技能' && source.some(s => s.title === '行迹');
    return {
      ...section,
      shortTitle: shortTitleFor(section, source, p.category),
      group: groupFor(section.title, p.category),
      variant: supplementary ? 'supplementary' : 'main',
      notes: supplementary ? ['这份来源保留了另一组技能参数；名称相同的能力可在「技能详解」中阅读说明。'] : [],
    };
  });
  const primary = sections.find(s => s.title === '行迹')
    || sections.find(s => /^(技能(?:（.*）)?|效果|精炼|光锥效果.*|套装效果)$/.test(s.title))
    || sections.find(s => s.title === '概述' && p.category?.endsWith('/traits'))
    || sections.find(s => s.group !== '来源');
  return sections.map(s => ({ ...s, isPrimary: s.id === primary?.id }));
}

const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim());
const genericColumn = name => /^(?:数值\d+|[A-Z])$/.test(name);

// These names are tied to the descriptions in the shipped 1415 snapshot.
// Guards intentionally require the matching ability text; unknown parameters
// retain their original identifiers instead of being assigned guessed meaning.
function knownColumns(entry, heading, tableHeaders, context) {
  if (entry !== 'hsr/characters/1415') return null;
  const raw = tableHeaders[0] === '#';
  if (/看，希望的起始/.test(heading) && /获得1点【追忆】/.test(context)) {
    if (raw && tableHeaders.join('/') === '#/A/B') {
      return { names: ['等级', '伤害倍率', '获得追忆'], note: '伤害倍率以昔涟生命上限计，0.25 表示 25%；追忆以点计。' };
    }
    if (tableHeaders.join('/') === '等级/数值1/数值2/数值3' && /敌方全体/.test(context)) {
      return { names: ['等级', '普攻·单体', '强化·单体', '强化·全体'], note: '三列均为冰属性伤害，占昔涟生命上限的比例；强化普攻先造成单体伤害，再造成全体伤害。' };
    }
  }
  if (/盛放吧，来世的乐土/.test(heading) && /真实伤害/.test(context)) {
    if (!raw && tableHeaders.join('/') === '等级/数值1') {
      return { names: ['等级', '额外真实伤害'], note: '数值为原伤害的比例，适用于结界期间我方目标造成的伤害。' };
    }
    if (raw && tableHeaders.join('/') === '#/A/B/C' && /持续2回合/.test(context) && /获得3点【追忆】/.test(context)) {
      return { names: ['等级', '真实伤害倍率', '结界回合', '获得追忆'], note: '倍率以原伤害计，0.12 表示 12%；结界以回合计，追忆以点计。' };
    }
  }
  if (/诗的.*誓约/.test(heading) && /暴击率提高/.test(context) && tableHeaders.join('/') === '等级/数值1') {
    return { names: ['等级', '暴击率提升'], note: '适用于昔涟与德谬歌，来源正文说明了该状态的激活条件。' };
  }
  if (/众愿啊，汇流如歌/.test(heading) && /全体目标造成的伤害提高/.test(context) && tableHeaders.join('/') === '等级/数值1') {
    return { names: ['等级', '全队伤害提升'], note: '昔涟在场时，我方全体目标造成的伤害提高。' };
  }
  return null;
}

export function prepareReaderContent(body = '', entry = '') {
  // Work per ability so a percentage in a different ability cannot label a table.
  return body.split(/(?=^### )/m).map(block => {
    const heading = /^### (.+)$/m.exec(block)?.[1] || '';
    return block.replace(/(?:^|\n)((?:[ \t]*\|[^\n]*(?:\n|$))+)/g, (match, table) => {
      const lines = table.trimEnd().split('\n');
      const headers = cells(lines[0]);
      if (!headers.some(genericColumn) || lines.length < 3) return match;
      const known = knownColumns(entry, heading, headers, block);
      const note = known?.note || `来源使用 ${headers.filter(genericColumn).join('、')} 标记参数，未提供完整列名；保留原始标记，请结合技能说明阅读。`;
      if (known) lines[0] = `| ${known.names.join(' | ')} |`;
      const rewritten = lines.join('\n');
      return `\n${rewritten}\n\n> **${known ? '数值口径' : '原始参数'}**：${note}\n\n`;
    });
  }).join('');
}

export function skillShortTitle(title) {
  const name = title.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const prefix = /^(普攻|战技|终结技|天赋|秘技|忆灵技|忆灵天赋)\s*[·：]/.exec(name)?.[1];
  const suffix = /[（(]([^）)]+)[）)]$/.exec(name)?.[1];
  return prefix || (/^(普攻|战技|终结技|天赋|秘技|忆灵技|忆灵天赋)$/.test(suffix || '') ? suffix : name);
}
