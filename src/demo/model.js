import {GROUP_NAMES} from './themes.js';
export function routeFromHash(){
  const [path,query='']=window.location.hash.slice(1).split('?');
  return {theme:(path||'').replace(/^\//,''),params:new URLSearchParams(query)};
}
export function href(theme,values={}){
  const params=new URLSearchParams();
  for(const [k,v] of Object.entries(values))if(v!==null&&v!==undefined&&v!=='')params.set(k,String(v));
  return `#/${theme}${params.size?'?'+params:''}`;
}
export const categoryName=c=>GROUP_NAMES[c?.split('/').at(-1)]||'资料';
export const isCurrency=p=>p.category.startsWith('currency/');
export function tags(p){
  const f=p.fields,keys=isCurrency(p)?['赛季','站位','特性','类型']:['评级','稀有度','属性','命途','特性','类型','阵营'];
  return [...new Set(keys.map(k=>f[k]).filter(Boolean).map(String))].slice(0,4);
}
export function infoFields(p){
  return Object.entries(p.fields).filter(([k,v])=>/[\u4e00-\u9fff]/.test(k)&&!/[来源核验]/.test(k)&&!['关联','治疗护盾'].includes(k)&&!(isCurrency(p)&&k==='星级')&&v!==null&&typeof v!=='object');
}
export function statFields(p){
  const keys=isCurrency(p)?['星阶','站位','成员数','类型']:['生命值','基础生命值','攻击力','基础攻击力','防御力','基础防御力','冲击力','基础速度','韧性'];
  return keys.filter(k=>p.fields[k]!==undefined).map(k=>[k,p.fields[k]]).slice(0,4);
}
export function filtersFor(category){
  const type=category.split('/').at(-1);
  if(['agents','characters'].includes(type))return ['属性',type==='agents'?'特性':'命途','阵营'];
  if(type==='enemies')return ['评级','阵营','弱点'];
  if(type==='sound_engines')return ['特性','稀有度'];
  if(type==='light_cones')return ['命途','星级'];
  if(type==='bangboo')return ['稀有度'];
  if(type==='roles')return ['站位','特性'];
  if(['relics','items','strategies'].includes(type))return ['类型'];
  return [];
}
export const splitValues=v=>String(v??'').split(/[、/]/).map(v=>v.trim()).filter(Boolean);
export function selectItems(items,{category,q='',filter='',value='',all=false,filters={}}){
  const active={...filters,...(filter&&value?{[filter]:value}:{})};
  return items.filter(p=>(all||p.category===category)&&(!q||`${p.name} ${p.id} ${p.fields.alias||''}`.toLowerCase().includes(q.toLowerCase()))&&Object.entries(active).every(([key,value])=>!value||(value==='__missing__'?p.fields[key]===undefined||p.fields[key]===null||p.fields[key]==='':splitValues(p.fields[key]).includes(value))));
}
export function dateLabel(p){
  const f=p.fields;
  return [f.start_time||f.start_time_text||'开始时间未提供',f.end_time||f.end_time_text||(f.end_open?'长期':'结束时间未提供')].map(s=>String(s).replace(/ 00:00:00$/,'')).join(' — ');
}
const levelHeader=/^(?:等级|技能等级|Lv\.?|精炼(?:等级)?|叠影(?:等级)?)$/i;
export function parseLevel(value){
  const match=String(value??'').trim().match(/^(?:等级|Lv\.?|精炼|叠影)?\s*(\d+)$/i);
  return match?String(Number(match[1])):null;
}
function levelTables(body){
  return [...body.matchAll(/(?:^|\n)((?:[ \t]*\|[^\n]*(?:\n|$))+)/g)].map(m=>{
    const lines=m[1].trimEnd().split('\n');
    const first=lines[0].split('|')[1]?.trim();
    const rowLabels=lines.slice(2).map(l=>l.split('|')[1]?.trim()).filter(Boolean);
    // A '#' column is an index unless its actual rows explicitly say Lv./等级.
    const explicitHashLevels=first==='#'&&rowLabels.length>0&&rowLabels.every(v=>/^(?:Lv\.?|等级)\s*\d+$/i.test(v));
    const values=levelHeader.test(first||'')||explicitHashLevels?[...new Set(rowLabels.map(parseLevel).filter(v=>v!==null))]:[];
    return {text:m[1],lines,values};
  });
}
export function sectionModes(body){
  const values=[...new Set(levelTables(body).flatMap(t=>t.values.length>1?t.values:[]))].sort((a,b)=>Number(a)-Number(b));
  return values.length>1?{values,type:'rows'}:null;
}
export function bodyAtLevel(body,level){
  // Filter each table independently: single-level abilities and unrelated tables stay intact.
  for(const table of levelTables(body)){
    if(table.values.length<2)continue;
    const selected=table.values.includes(String(level))?String(level):null;
    const kept=table.lines.filter((line,i)=>i<2||parseLevel(line.split('|')[1])===null||parseLevel(line.split('|')[1])===selected);
    if(selected===null)kept.push(`| ${level} | 此等级未收录 |`);
    body=body.replace(table.text,kept.join('\n')+(table.text.endsWith('\n')?'\n':''));
  }
  return body;
}
export function nearestLevel(values,level){return values.reduce((best,v)=>Math.abs(Number(v)-Number(level))<Math.abs(Number(best)-Number(level))?v:best,values[0]);}
