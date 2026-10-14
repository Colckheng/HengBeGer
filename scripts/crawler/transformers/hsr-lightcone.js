import { stripHtml } from '../html.js';
import { commonFrontMatter, decodeParts, sourceError, textValue } from './hsr-shared.js';

const STAR_MAP = { 一星: 1, 二星: 2, 三星: 3, 四星: 4, 五星: 5 };

function positiveNumber(value, content, label) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw sourceError(content, '80级 ' + label + ' missing or invalid');
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw sourceError(content, '80级 ' + label + ' missing or invalid');
  }
  return number;
}

export function transformHsrLightcone({ content, listItem, localId, existing, now = new Date() }) {
  const fm = commonFrontMatter({ content, localId, existing, now }, 'lightcone');
  const parts = decodeParts(content, 'light');
  const main = parts.find((part) => part.partKey === 'main').data;
  const value = parts.find((part) => part.partKey === 'value')?.data;
  if (!value || !Array.isArray(value.material)) throw sourceError(content, 'light/value material must be an array');

  const filters = listItem?.filters || {};
  const career = textValue(main.career) || textValue(filters['命途']);
  const rate = textValue(filters['星级']) || textValue(main.rate);
  const rarity = STAR_MAP[rate] || Number(/^([1-5])(?:星)?$/.exec(rate)?.[1]);
  if (career) fm.命途 = career;
  if (rarity) fm.星级 = rarity;

  const confirmedRows = value.material.filter((row) => textValue(row?.name) === '80级');
  const unconfirmedRows = value.material.filter((row) => /^80级[（(]未确认[）)]$/.test(textValue(row?.name)));
  if (confirmedRows.length > 1 || unconfirmedRows.length > 1) throw sourceError(content, 'duplicate 80-level value rows');
  const stats80 = confirmedRows[0];
  const unconfirmed80 = unconfirmedRows[0];
  if (!stats80 && !unconfirmed80) throw sourceError(content, 'missing confirmed or unconfirmed 80-level values');

  const sourceWarnings = !stats80
    ? ['源面板“' + textValue(unconfirmed80.name) + '”标记未确认，保留种子基础生命值、基础攻击力、基础防御力']
    : [];
  let statsContent;
  if (stats80) {
    const hp = positiveNumber(stats80.life, content, '生命值');
    const atk = positiveNumber(stats80.attack, content, '攻击力');
    const def = positiveNumber(stats80.defense, content, '防御力');
    fm.基础生命值 = hp;
    fm.基础攻击力 = atk;
    fm.基础防御力 = def;
    statsContent = [
      '| 项目       | 数值 |',
      '| ---------- | ---- |',
      '| 基础生命值 | ' + hp + ' |',
      '| 基础攻击力 | ' + atk + ' |',
      '| 基础防御力 | ' + def + ' |',
    ].join('\n');
  } else {
    statsContent = [
      '| 项目       | 数值 |',
      '| ---------- | ---- |',
      '| 基础生命值 | ' + (existing?.基础生命值 ?? '未确认') + ' |',
      '| 基础攻击力 | ' + (existing?.基础攻击力 ?? '未确认') + ' |',
      '| 基础防御力 | ' + (existing?.基础防御力 ?? '未确认') + ' |',
      '',
      '> 官方页面将该等级标记为未确认；此处保留既有资料值。',
    ].join('\n');
  }

  const skill = textValue(main.skill);
  const skillHeading = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(skill);
  const skillName = skillHeading ? stripHtml(skillHeading[1]).trim() : '';
  if (skillName) fm.技能名 = skillName;

  return {
    fm,
    sections: [{ heading: '## 基础数值（等级 80）', content: statsContent }],
    sourceWarnings,
  };
}

export default transformHsrLightcone;
