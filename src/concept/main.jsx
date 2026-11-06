import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import index from '../demo/__fixtures__/index.json';
import artworks from '../demo/artworks.json';
import {FILTER_FIELDS, INITIAL_STATE, WORLDS, changeSeason, groupFor, identity, isMissing, matchesFacets, readLocation, shouldRestoreScroll, toggleFacet, valueParts} from './state';
import './style.css';

const fixtures = import.meta.glob('../demo/__fixtures__/entries/*.json');
const worlds = WORLDS;
const filterFields = FILTER_FIELDS;
const initial = INITIAL_STATE;
const groupForCategory = category => groupFor(index.groups, category);

function locationFor(state) {
  const params = new URLSearchParams();
  if (state.world !== 'all') params.set('world',state.world);
  if (state.category !== 'all') params.set('category',state.category);
  if (state.world === 'currency') params.set('season',state.season);
  if (state.query) params.set('q',state.query);
  Object.entries(state.facets).forEach(([key,values])=>values.forEach(value=>{if(value) params.append(`f.${key}`,value);}));
  if (state.itemId) {
    params.set('item',state.itemId);
    if (state.itemCategory && state.itemCategory !== state.category) params.set('itemCategory',state.itemCategory);
  }
  const query=params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}
function Image({item}) {
  const [failed,setFailed] = useState(false);
  const artwork = artworks[item.key];
  // 完整立绘优先：条目缩略图多半只裁了头肩，塞进横向卡片里会只剩头顶。
  const isArtwork = artwork && artwork.usage!=='emblem';
  const src = isArtwork ? artwork.src : item.image;
  return <div className={`artwork ${isArtwork?'artwork--art':'artwork--thumb'}`}>{src && !failed ? <img src={src} alt="" loading="lazy" onError={()=>setFailed(true)}/> : <span>暂无图片</span>}</div>;
}
function Card({item,onOpen}) {
  return <button className="card" onClick={()=>onOpen(item)}><Image item={item}/><span className="card-copy"><small>{groupForCategory(item.category)?.name}</small><strong>{item.name}</strong><span>{[item.fields?.['属性'],item.fields?.['命途'] || item.fields?.['特性'] || item.fields?.['类型'] || item.fields?.['站位']].filter(Boolean).join(' · ')}</span><span className="card-id">ID {item.id} <b aria-hidden="true">↗</b></span></span></button>;
}
function MarkdownSection({part,partIndex}) {
  let headingIndex = 0;
  const components = {
    h3: ({children}) => <h3 id={`chapter-${partIndex}-sub-${headingIndex++}`}>{children}</h3>,
    table: ({children}) => <div className="table-wrap" role="region" aria-label="数据表，可横向滚动" tabIndex={0}><span className="table-hint">表格可横向滚动 →</span><table>{children}</table></div>,
    img: ({src,alt}) => <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={alt || '正文图片，点击查看原图'} onError={event=>{event.currentTarget.alt='图片加载失败，可打开原图';}}/></a>,
  };
  return <ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>{part.body.replace(/\\n/g,'\n')}</ReactMarkdown>;
}
function Detail({item,onBack,saved,onSave}) {
  const [detail,setDetail] = useState(null);
  const [error,setError] = useState(false);
  useEffect(()=>{
    let active=true;
    setDetail(null); setError(false);
    const loader=fixtures[`../demo/__fixtures__/entries/${item.detailFile.split('/').pop()}`];
    if (!loader) {setError(true);return undefined;}
    loader().then(module=>{if(active)setDetail(module.default);}).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[item]);
  const sections = detail?.sections?.filter(part=>part.body?.trim()) || [];
  return <div className="detail page-width"><button className="back" onClick={onBack}>← 返回结果</button><div className="detail-header"><Image item={item}/><div><p className="eyebrow">{groupForCategory(item.category)?.name} / ID {item.id}</p><h1>{item.name}</h1><p>{[item.fields?.['属性'],item.fields?.['命途'],item.fields?.['特性'],item.fields?.['站位']].filter(Boolean).join(' · ')}</p><button className="save" aria-pressed={saved} onClick={onSave}>{saved?'已收藏':'收藏此条'}</button><small>收藏仅在当前页面会话保留</small></div></div>
    {error ? <p role="alert">样本加载失败，请返回重试。</p> : !detail ? <p role="status">正在读取样本…</p> : <div className="reader-layout"><details className="toc" open><summary>内容目录 · 选择章节与技能</summary><nav aria-label="内容目录">{sections.map((part,i)=><div key={part.id}><a href={`#chapter-${i}`}>{part.title}</a>{[...part.body.matchAll(/^###\s+(.+?)\s*$/gm)].map((match,j)=><a className="sub-link" key={j} href={`#chapter-${i}-sub-${j}`}>{match[1]}</a>)}</div>)}</nav></details><article className="reader">{item.issues?.length>0 && <aside className="notice"><strong>阅读提示</strong>{item.issues.map(issue=><p key={issue}>{issue}</p>)}</aside>}{sections.map((part,i)=><section key={part.id} id={`chapter-${i}`}><h2>{part.title}</h2><div className="markdown"><MarkdownSection part={part} partIndex={i}/></div></section>)}<details className="source"><summary>来源与样本说明</summary><p>来源：{item.fields?.source || '未提供'} · 采集时间：{item.fields?.last_crawled_at || item.fields?.captured_at || '未提供'}</p>{item.fields?.source_url && <a href={item.fields.source_url} target="_blank" rel="noreferrer">打开来源 ↗</a>}{item.sourceCheck?.scope && <p>补充核验范围：{item.sourceCheck.scope}</p>}{item.rawName !== item.name && <p>原始名称：{item.rawName}</p>}</details></article></div>}
  </div>;
}
export function App() {
  const [state,setState] = useState(()=>readLocation(window.location.search, index.groups));
  const [draft,setDraft] = useState(state.query);
  const [saved,setSaved] = useState([]);
  const [onlySaved,setOnlySaved] = useState(false);
  const [listScroll,setListScroll] = useState(0);
  const [filtersOpen,setFiltersOpen] = useState(false);
  const lastSearch=useRef(window.location.search);
  useEffect(()=>{const onPop=()=>{const search=window.location.search;const next=readLocation(search, index.groups);const listChanged=shouldRestoreScroll(lastSearch.current, search);lastSearch.current=search;setState(next);setDraft(next.query);if(listChanged)requestAnimationFrame(()=>window.scrollTo(0,window.history.state?.listScroll || 0));};window.addEventListener('popstate',onPop);return ()=>window.removeEventListener('popstate',onPop);},[]);
  const navigate = (next, replace=false, scroll=0) => {window.history[replace?'replaceState':'pushState']({listScroll:scroll},'',locationFor(next));lastSearch.current=window.location.search;setState(next);setDraft(next.query);};
  const selectWorld = world => navigate({...state,world,category:'all',facets:{},itemId:null});
  const selectCategory = category => {navigate({...state,world:category.split('/')[0],category,season:category.includes('/season2/')?'season2':state.season,facets:{},itemId:null});setFiltersOpen(true);};
  const selectFacet = (field,value) => navigate({...state,facets:toggleFacet(state.facets, field, value)});
  const item = state.itemId && index.items.find(entry=>entry.category===(state.itemCategory || state.category) && String(entry.id)===state.itemId);
  const options = useMemo(()=>{
    const fields=filterFields[state.category.split('/').at(-1)] || [];
    return fields.map(field=>{const items=index.items.filter(entry=>entry.category===state.category);const values=[...new Set(items.flatMap(entry=>isMissing(entry.fields?.[field])?[]:valueParts(entry.fields[field])))];return {field,values,missing:items.some(entry=>isMissing(entry.fields?.[field]))};});
  },[state.category]);
  const worldGroups = useMemo(() => {
    const list = state.world === 'all'
      ? index.groups
      : index.groups.filter(group => group.id.startsWith(`${state.world}/`));
    return state.world === 'currency'
      ? list.filter(group => group.id.includes(`/${state.season}/`))
      : list;
  }, [state.world, state.season]);
  // 选定了世界就只留分类词（"代理人"）；在"全部"视图下要带世界，
  // 否则星铁/绝区零的同名分类（敌人、机制）会撞成两个一样的 chip。
  const categoryLabel = group => {
    const text = group.name;
    const match = /^(绝区零|星铁|货币战争)\s*(S\d+)?\s*·\s*/.exec(text);
    if (!match) return text;
    const rest = text.slice(match[0].length);
    if (state.world !== 'all') return rest;
    return `${match[1]}${match[2] ? ` ${match[2]}` : ''} ${rest}`;
  };
  const results = index.items.filter(entry=>{
    if(state.world!=='all' && !entry.category.startsWith(`${state.world}/`))return false;
    if(state.world==='currency' && state.category==='all' && !entry.category.startsWith(`currency/${state.season}/`))return false;
    if(state.category!=='all' && entry.category!==state.category)return false;
    if(onlySaved && !saved.includes(identity(entry)))return false;
    if(state.query && !`${entry.name} ${entry.id} ${entry.fields?.alias || ''}`.toLowerCase().includes(state.query.trim().toLowerCase()))return false;
    return matchesFacets(entry, state.facets);
  });
  const openItem = entry => {const pos=window.scrollY;setListScroll(pos);window.history.replaceState({...window.history.state,listScroll:pos},'');navigate({...state,itemCategory:entry.category,itemId:String(entry.id)},false,pos);window.scrollTo(0,0);};
  const goBack = () => {const next={...state,itemId:null};navigate(next,false,listScroll || window.history.state?.listScroll || 0);requestAnimationFrame(()=>window.scrollTo(0,listScroll || window.history.state?.listScroll || 0));};
  const categoryGroup = groupForCategory(state.category);
  return <div className="app"><a className="skip" href="#main">跳到主要内容</a><header className="masthead"><div className="page-width masthead-inner"><button className="brand" onClick={()=>{setOnlySaved(false);navigate(initial);}}>H<span> / </span>HengBerGer <small>资料索引</small></button><span className="mast-note">CONCEPT / 87 SAMPLE RECORDS</span><button className="library-button" aria-pressed={onlySaved} onClick={()=>{setOnlySaved(!onlySaved);if(state.itemId)goBack();}}>收藏 {saved.length}</button></div></header><main id="main">{state.itemId ? item ? <Detail item={item} onBack={goBack} saved={saved.includes(identity(item))} onSave={()=>setSaved(current=>current.includes(identity(item))?current.filter(key=>key!==identity(item)):[...current,identity(item)])}/> : <div className="page-width empty"><h1>未找到这条样本</h1><button onClick={goBack}>返回结果</button></div> : <div className="page-width browse"><div className="intro"><div><p className="eyebrow">THE GAME ARCHIVE / 资料索引</p><h1>在熟悉的世界里，<br/><em>找到更多细节。</em></h1></div><p>这里展示 87 条真实资料样本，覆盖 23 个分组。搜索和筛选仅作用于样本；分类总数来自数据快照。</p></div><form className="search" onSubmit={event=>{event.preventDefault();navigate({...state,query:draft,itemId:null});}}><label htmlFor="query">搜索资料</label><input id="query" value={draft} onChange={event=>setDraft(event.target.value)} placeholder="输入名称、别名或 ID"/><button type="submit">搜索 <span aria-hidden="true">↗</span></button></form><div className="results"><div className="results-head"><div><p className="eyebrow">资料索引 / 搜索结果</p><h2>{onlySaved?'我的收藏':categoryGroup?.name || (worlds.find(world=>world.id===state.world)?.name || '全部资料')}</h2><p>显示 <strong>{results.length}</strong> 条样本{categoryGroup && <> · 本分类 {categoryGroup.count} 条样本 / 数据快照总数 {categoryGroup.total} 条</>}</p></div>{state.world==='currency'&&<div className="seasons" aria-label="货币战争赛季">{['season1','season2'].map(season=><button key={season} aria-pressed={state.season===season} onClick={()=>navigate(changeSeason(state,season))}>{season==='season1'?'S1':'S2'}</button>)}</div>}</div><div className="active-filters"><span>当前条件</span>{state.query&&<button onClick={()=>navigate({...state,query:''})}>搜索：{state.query} ×</button>}{Object.entries(state.facets).flatMap(([field,values])=>values.map(value=><button key={`${field}:${value}`} onClick={()=>selectFacet(field,value)}>{field}：{value==='__missing__'?'未提供':value} ×</button>))}{!state.query&&!Object.keys(state.facets).length&&<span>无</span>}{(state.query||Object.keys(state.facets).length>0)&&<button className="clear" onClick={()=>navigate({...state,query:'',facets:{}})}>清除全部</button>}</div><details className="filters" open={filtersOpen} onToggle={event=>setFiltersOpen(event.currentTarget.open)}>
<summary>筛选 <span>{Object.values(state.facets).reduce((sum,values)=>sum+values.length,0)} 项已选</span></summary>
<div className="filter-row">
<span className="filter-label">世界</span>
<div className="filter-values">{[{id:'all',name:'全部'},...worlds].map(world=><button key={world.id} type="button" className="chip" aria-pressed={state.world===world.id} onClick={()=>selectWorld(world.id)}>{world.name}</button>)}</div>
</div>
{state.world==='currency'&&<div className="filter-row">
<span className="filter-label">赛季</span>
<div className="filter-values">{['season1','season2'].map(season=><button key={season} type="button" className="chip" aria-pressed={state.season===season} onClick={()=>navigate(changeSeason(state,season))}>{season==='season1'?'S1':'S2'}</button>)}</div>
</div>}
<div className="filter-row">
<span className="filter-label">分类</span>
<div className="filter-values">{worldGroups.map(group=><button key={group.id} type="button" className="chip" aria-pressed={state.category===group.id} aria-label={`${group.name}，本分类 ${group.count} 条样本 / 数据快照总数 ${group.total} 条`} title={`${group.name} · 本分类 ${group.count} 条样本 / 数据快照总数 ${group.total} 条`} onClick={()=>selectCategory(group.id)}>{categoryLabel(group)}</button>)}</div>
</div>
<p className="filter-note">{worldGroups.length} 个分类 · 样本 {worldGroups.reduce((sum,group)=>sum+group.count,0)} 条 / 数据快照总数 {worldGroups.reduce((sum,group)=>sum+group.total,0)} 条</p>
{state.category.startsWith('currency/')&&state.category.endsWith('/roles')&&<p className="facet-note">星阶按现有字段分组，与星级的关系尚未确认。</p>}
{options.map(({field,values,missing})=><div className="filter-row" key={field}>
<span className="filter-label">{field}</span>
<div className="filter-values">{[...values,...(missing?['__missing__']:[])].map(value=><button type="button" className="chip" key={value} aria-pressed={(state.facets[field] || []).includes(value)} onClick={()=>selectFacet(field,value)}>{value==='__missing__'?'未提供':value}</button>)}</div>
</div>)}
</details>{results.length ? <div className="cards">{results.map(entry=><Card key={identity(entry)} item={entry} onOpen={openItem}/>)}</div> : <div className="empty"><h3>没有匹配的样本</h3><p>试试清除搜索或筛选条件。</p><button onClick={()=>{setOnlySaved(false);navigate({...state,query:'',facets:{}});}}>清除条件</button></div>}</div></div>}</main><footer className="page-width footer"><strong>H / HengBerGer</strong><span>资料索引 · 87 条样本预览</span><span>分类总数为数据快照口径</span></footer></div>;
}
const root=document.getElementById('root');
if (root) createRoot(root).render(<App/>);
