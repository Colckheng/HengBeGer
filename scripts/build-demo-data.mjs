import fs from 'node:fs';
import path from 'node:path';
import { compileCatalog, hash } from './catalog/data.js';

const root=process.cwd();
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/23-ui-samples-2026-10-08.json'),'utf8'));
const catalog=compileCatalog(root);
const entries=new Map(catalog.entries.map(e=>[e.key,e.payload]));
const chosen=new Set(manifest.categories.flatMap(g=>g.samples.map(s=>s.key)));
const dest=path.join(root,'public/demo-data');
fs.mkdirSync(path.join(dest,'entries'),{recursive:true});
fs.mkdirSync(path.join(dest,'images'),{recursive:true});
const safeName=s=>s.replace(/<\/?unbreak>/gi,'').replace(/<[^>]*>/g,'').replace(/\{NICKNAME\}/g,'开拓者（原名待核验）');
const displayName=p=>/^(OfficialName_|未命名)$/.test(p.name)?`名称待补充 · ${p.id}`:safeName(p.name);
const aliases={role:'roles',trait:'traits',item:'items',augment:'strategies',buff:'environments',character:'characters',lightcone:'light_cones',relicset:'relics',weapon:'sound_engines',equipment:'drive_disks',monster:'enemies'};
function resolve(p,type,id){
  const base=p.category.startsWith('currency/')?p.category.split('/').slice(0,2).join('/'):p.category.split('/')[0];
  const category=p.category.startsWith('zzz/')&&type==='character'?'agents':aliases[type]||type;
  return entries.get(`${base}/${category}/${id}`);
}
function cleanBody(p){
  const reference=(_m,attrs)=>{
    const type=/type=["']?([\w]+)/.exec(attrs)?.[1],id=/id=["']?(\d+)/.exec(attrs)?.[1];
    const match=resolve(p,type,id);
    return match?(chosen.has(match.key)?`[${displayName(match)}](entry:${match.key})`:displayName(match)):`关联资料${id?` #${id}`:''}（待解析）`;
  };
  return p.body.replace(/<gridfightinfo\s+([^>]+)>[\s\S]*?<\/gridfightinfo>/gi,reference)
    .replace(/<gridfightinfo\s+([^>]+)>/gi,reference)
    .replace(/<\/?(?:unbreak|i|b|color)(?:\s[^>]*)?>/gi,'').replace(/<br\s*\/?>/gi,'\n')
    .replace(/\[([^\]]+)\]\(\.\.\/([a-z_]+)\/(\d+)[^)]*\.md\)/g,(_m,label,type,id)=>{
      const match=resolve(p,type,id);
      return match&&chosen.has(match.key)?`[${displayName(match)}](entry:${match.key})`:safeName(label);
    });
}
function sections(body){
  const parts=[];let current={title:'概述',body:''};
  for(const line of body.split(/\r?\n/)){
    const m=/^##\s+(.+)/.exec(line);
    if(m){if(current.body.trim())parts.push(current);current={title:m[1],body:''};}
    else if(!/^#\s+/.test(line))current.body+=line+'\n';
  }
  if(current.body.trim())parts.push(current);
  return parts.map((s,i)=>({...s,id:`section-${i}`}));
}
const groups=[];const items=[];
for(const g of manifest.categories){
  groups.push({id:g.category,name:g.label,total:g.total,count:g.samples.length});
  for(const s of g.samples){
    const p=entries.get(s.key);if(!p)throw Error(s.key);
    if(hash(fs.readFileSync(s.path))!==s.fileSha256)throw Error(`Sample changed: ${s.key}`);
    const body=cleanBody(p),issues=[...p.issues];
    if(p.category==='hsr/enemies'&&p.fields.属性等级)issues.push('当前摘要为Lv.80；历史正文保留其原始等级，请分开阅读。');
    if(p.key==='currency/season2/roles/151122')issues.push('星级字段为5，原文显示六星；星级与星阶含义仍待核验。');
    if(/<gridfightinfo|\b\d+i\b/.test(p.body))issues.push('部分来源文本含动态引用或异常数值标记，尚待核验。');
    if(/OfficialName_|未命名|NICKNAME/.test(p.name))issues.push('来源未提供可确认的完整名称。');
    if(p.category.endsWith('/gacha'))issues.push('日期与状态按来源快照展示，不代表当前开放情况。');
    const imagePath=p.fields.image;
    let image=null;
    if(p.imageHash){
      const name=p.imageHash+path.extname(imagePath);image=`/demo-data/images/${name}`;
      fs.copyFileSync(path.join(root,'data/images',imagePath),path.join(dest,'images',name));
    }
    const item={key:p.key,id:p.id,category:p.category,name:displayName(p),rawName:p.name,image,fields:p.fields,
      issues:[...new Set(issues)],sourceCheck:p.sourceCheck,detailFile:`/demo-data/entries/${hash(p.key).slice(0,16)}.json`};
    fs.writeFileSync(path.join(root,'public',item.detailFile),JSON.stringify({...item,sections:sections(body),body}));
    items.push(item);
  }
}
fs.writeFileSync(path.join(dest,'index.json'),JSON.stringify({generatedAt:new Date().toISOString(),treeHash:catalog.treeHash,groups,items}));
console.log(JSON.stringify({groups:groups.length,items:items.length,images:items.filter(e=>e.image).length,dataTreeHash:catalog.treeHash}));
