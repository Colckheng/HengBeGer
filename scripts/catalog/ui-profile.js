// Proposed UI contract. These profiles do not change the running catalog API.
const profile = (fields, filters, modules) => ({ fields, filters, modules });
export const UI_PROFILES = {
  'zzz/agents': profile(['评级','星级','属性','特性','阵营','攻击方式','生命值','攻击力','防御力','冲击力'], ['评级','属性','特性','阵营'], ['技能','影画','突破','材料','故事']),
  'zzz/sound_engines': profile(['稀有度','特性','基础攻击力','基础防御力','副词条类型','副词条数值','技能名'], ['稀有度','特性'], ['属性','精炼','材料']),
  'zzz/drive_disks': profile(['稀有度'], [], ['两件','四件','套装','故事']),
  'zzz/bangboo': profile(['稀有度','生命值','攻击力','防御力','冲击力'], ['稀有度'], ['技能','突破','材料']),
  'zzz/enemies': profile(['评级','阵营','弱点','属性'], ['评级','阵营','弱点'], ['属性','抗性','技能','变体']),
  'zzz/gacha': profile(['record_scope','version','start_time','start_time_text','end_time','end_time_text','end_open'], [], ['UP']),
  'zzz/formula': profile(['标题','author','license','version'], [], ['公式','计算']),
  'hsr/characters': profile(['星级','命途','属性','阵营','基础生命值','基础攻击力','基础防御力','基础速度'], ['星级','命途','属性','阵营'], ['晋阶','行迹','技能','忆灵','星魂','材料','故事']),
  'hsr/light_cones': profile(['星级','命途','基础生命值','基础攻击力','基础防御力','技能名'], ['星级','命途'], ['属性','叠影','材料']),
  'hsr/relics': profile(['类型','套装名称'], ['类型'], ['套装','部件','推荐']),
  'hsr/enemies': profile(['评级','阵营','弱点','属性等级','属性口径','生命值','攻击力','防御力','速度'], ['评级','阵营','弱点'], ['属性','抗性','技能','变体','快照']),
  'hsr/gacha': profile(['record_scope','version','half','start_time','start_time_text','end_time','end_time_text','end_open','history_ref'], ['record_scope'], ['UP']),
  'hsr/formula': profile(['标题','author','license','version'], [], ['公式','计算']),
  'currency/roles': profile(['赛季','站位','特性','星阶','星级','治疗护盾'], ['站位','特性'], ['星阶','前排','后排','技能','光锥','星魂']),
  'currency/traits': profile(['赛季','成员数'], ['成员数'], ['概述','羁绊','成员','效果','顾问']),
  'currency/items': profile(['赛季','类型','稀有度'], ['类型'], ['效果','属性']),
  'currency/strategies': profile(['赛季','类型'], ['类型'], ['说明']),
  'currency/environments': profile(['赛季','关联'], [], ['说明']),
};
export const hasValue = value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '') && !(Array.isArray(value) && value.length === 0);
export const profileKey = category => category.replace(/\/season[12]\//, '/');
export const displayName = (name, id) => /^(OfficialName_?|未命名)$/.test(name) ? `名称待补充 · ${id}` : String(name).replace(/<\/?unbreak>/gi, '').replace(/\{NICKNAME\}/g, '开拓者（原名待核验）');
export function fieldState(category, field, value) {
  if (!hasValue(value)) return 'missing';
  if (category.endsWith('/roles') && ['星级','星阶','治疗护盾'].includes(field)) return 'needs_review';
  if (category.endsWith('/environments') && field === '关联') return 'unresolved_reference';
  if (field === 'version') return 'source_version_unclassified';
  return 'present'; // Presence is not a claim of full factual verification.
}
export function referenceTarget(category, type, id, knownKeys) {
  const currency = category.startsWith('currency/');
  const base = currency ? category.split('/').slice(0,2).join('/') : category.split('/')[0];
  const aliases = currency ? { role:'roles',trait:'traits',item:'items',augment:'strategies',buff:'environments' }
    : { character:base === 'zzz' ? 'agents':'characters',lightcone:'light_cones',relicset:'relics',weapon:'sound_engines',equipment:'drive_disks',monster:'enemies' };
  const target = `${base}/${aliases[type] || type}/${id}`;
  return { targetKey:target, status:knownKeys.has(target) ? 'resolved':'unresolved', reason:knownKeys.has(target)?null:UI_PROFILES[profileKey(`${base}/${aliases[type] || type}`)]?'target_not_in_catalog':'category_not_in_catalog' };
}
export function splitSections(body) {
  const out=[];let current={id:'section-0',title:'概述',bodyMarkdown:''};
  for(const line of body.split(/\r?\n/)) {
    const match=/^##\s+(.+)/.exec(line);
    if(match){if(current.bodyMarkdown.trim())out.push(current);current={id:`section-${out.length}`,title:match[1],bodyMarkdown:''};}
    else current.bodyMarkdown+=line+'\n';
  }
  if(current.bodyMarkdown.trim())out.push(current);
  return out;
}
export function contractExample(p, findings=[]) {
  const config=UI_PROFILES[profileKey(p.category)];
  const currency=p.category.startsWith('currency/');
  const fields=config.fields.map(field=>({key:field,value:p.fields[field] ?? null,state:fieldState(p.category,field,p.fields[field]),sourcePointer:`/fields/${field}`}));
  const numerical=['生命值','攻击力','防御力','基础生命值','基础攻击力','基础防御力','基础速度','基础攻击力','基础防御力','冲击力'];
  return {
    contractVersion:'proposal-1',
    identity:{key:p.key,category:p.category,id:p.id,world:currency?'currency':p.category.split('/')[0],season:currency?p.category.split('/')[1]:null,name:displayName(p.name,p.id),rawName:p.name},
    image:{url:p.imageHash?`/api/catalog/images/${p.imageHash}`:null,state:p.imageHash?'available_local':'missing',hash:p.imageHash,kind:p.category.split('/').at(-1)},
    fields,
    numericContext:{level:p.fields.属性等级 ?? null,difficulty:p.fields.难度组 ?? null,rawContext:p.fields.属性口径??null,state:p.fields.属性等级?'explicit_level':'not_normalized',note:'字段存在不表示等级已核实；未归一化数值不用于跨条目排名。正文按原章节和来源分别显示。',rawFields:fields.filter(f=>numerical.includes(f.key))},
    dateContext:p.category.endsWith('/gacha')?{start:{value:p.fields.start_time||null,text:p.fields.start_time_text||null},end:{value:p.fields.end_time||null,text:p.fields.end_time_text||null,open:p.fields.end_open===true},timezone:null,computedStatus:null,recordScope:p.fields.record_scope||null}:null,
    sections:splitSections(p.body),
    provenance:{source:p.fields.source||null,url:p.fields.source_url||null,sourceVersion:p.fields.version||null,gameVersion:null,capturedAt:p.fields.last_crawled_at||null,supplement:p.sourceCheck||null},
    quality:{factualVerification:'partial_or_not_established',issues:findings.map(f=>({code:f.code,field:f.field||null,severity:f.severity,classification:f.classification,evidence:f.evidence}))},
    rendering:{markdown:'Raw snapshot; sanitize and resolve references before user-facing rendering. No raw HTML execution.',unknownValue:null},
  };
}
