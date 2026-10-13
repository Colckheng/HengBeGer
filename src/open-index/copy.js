// Production copy for the open index. The demo keeps its own wording so the
// design preview can stay a preview; the shipped site states real totals.
export const THEME = 'orbital';
export const SITE = {name: '开放图录', en: 'THE OPEN INDEX', tag: '向每一份好奇心开放。'};

export const WORLDS_COPY = {
  zzz: {art: '/demo-art/zzz-1011.png', subject: '安比', line: '都市的另一面，从相遇开始。', categories: ['agents', 'sound_engines', 'bangboo']},
  hsr: {art: '/demo-art/hsr-1224.png', subject: '三月七', line: '沿着星轨，发现新的可能。', categories: ['characters', 'light_cones', 'relics']},
  currency: {art: '/demo-art/hsr-1502.png', subject: '爻光', line: '读懂规则，让组合产生回响。', categories: ['roles', 'traits', 'strategies']},
};

export const HOME_READING = ['hsr/characters/1415', 'zzz/agents/1011', 'hsr/formula/hsr-formula-damage'];

export const COPY = {
  portalCount: n => `${n} 份资料`,
  portalCountSeason: n => `${n} 份资料 · 第一赛季`,
  aboutTitle: '每一份好奇，都有出处。',
  aboutBody: n => `图录保留资料来源、收录日期与数值口径。当前已收录 ${n} 份资料，并在持续补充中。`,
  worldCounts: n => `${n} 份资料`,
  directoryNote: '数字为该分类当前收录的资料数。',
  listTotal: n => `目录共 ${n} 条`,
  searchAll: n => `全部 ${n} 份档案`,
};
