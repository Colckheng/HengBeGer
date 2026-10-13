import {useEffect,useState,useRef,useId} from 'react';
import {THEMES,PAGE_TYPES,GAME_NAMES} from './themes.js';
import {routeFromHash,href,categoryName,filtersFor,splitValues,selectItems} from './model.js';
import CollectionLayouts from './CollectionLayouts.jsx';
import DetailLayouts from './DetailLayouts.jsx';
import WorldLayouts from './WorldLayouts.jsx';
import {CategoryLinks,SeasonSwitch} from './Visuals.jsx';
import Home from './DesignHome.jsx';
import Gallery from './DesignGallery.jsx';
import {AtlasMark} from './AtlasEdition.jsx';
import {buildReturnHref,safeReturnHref,restoreSourcePosition} from './navigation.js';


const cache=new Map();
function useResource(url){
  const [state,setState]=useState({});
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!url||cache.has(url))return;
    const controller=new AbortController();
    fetch(url,{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('资料暂时没有加载成功');return r.json();}).then(data=>{cache.set(url,data);setState({url,data});}).catch(e=>{if(e.name!=='AbortError')setState({url,error:e.message});});
    return ()=>controller.abort();
  },[url,retry]);
  return {data:cache.get(url)||(state.url===url?state.data:null),error:state.url===url?state.error:null,retry:()=>{setState({});setRetry(n=>n+1);}};
}
function Arrow(){return <span aria-hidden="true">↗</span>;}
function SearchIcon(){return <svg className="search-glyph" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.5"/></svg>;}
function Mark(){return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 5h8v11h14V5h8v30h-8V24H13v11H5z" fill="currentColor"/><path d="M16 5h8v8h-8zM16 27h8v8h-8z" fill="currentColor" opacity=".3"/></svg>;}
function Loading({error,retry}){return <div className="loading-panel" role={error?'alert':'status'}><span className="loading-mark">H/B</span><h2>{error?'这一页稍后再试':'正在展开资料…'}</h2>{error&&<button className="button" onClick={retry}>重新加载 <Arrow/></button>}</div>;}
function ReviewBar({theme,route}){
  const [open,setOpen]=useState(false);
  const buttonRef=useRef(null),menuRef=useRef(null),menuId=useId();
  useEffect(()=>{
    if(!open)return;
    menuRef.current?.querySelector('a')?.focus();
    const dismiss=e=>{
      if(e.type==='keydown'){
        if(e.key!=='Escape')return;
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }else if(!menuRef.current?.contains(e.target)&&!buttonRef.current?.contains(e.target))setOpen(false);
    };
    document.addEventListener('keydown',dismiss);
    document.addEventListener('pointerdown',dismiss);
    document.addEventListener('focusin',dismiss);
    return ()=>{
      document.removeEventListener('keydown',dismiss);
      document.removeEventListener('pointerdown',dismiss);
      document.removeEventListener('focusin',dismiss);
    };
  },[open]);
  return <div className="review-bar" role="region" aria-label="设计预览工具"><a href="#/" className="review-home">← 设计总览</a><label><span>风格</span><select aria-label="设计风格" value={theme.id} onChange={e=>{setOpen(false);window.location.hash=href(e.target.value,route).slice(1);}}>{THEMES.map(t=><option key={t.id} value={t.id}>{t.letter} · {t.name}</option>)}</select></label><button ref={buttonRef} className="page-picker" aria-expanded={open} aria-controls={menuId} onClick={()=>setOpen(!open)}>浏览页面 <span aria-hidden="true">{open?'−':'+'}</span></button><span className="review-hint">修订版 · 设计比较</span>
    {open&&<nav className="page-menu" id={menuId} ref={menuRef} aria-label="示例页面">{PAGE_TYPES.map((p,i)=>{const current=p.key?route.entry===p.key:!route.entry&&(route.view||'home')===p.view&&(!p.category||p.category===route.category);return <a key={p.id} aria-current={current?'page':undefined} href={href(theme.id,{view:p.view||'list',category:p.category||p.key?.slice(0,p.key.lastIndexOf('/')),entry:p.key})} onClick={()=>{setOpen(false);buttonRef.current?.focus();}}><span>{String(i+1).padStart(2,'0')}</span>{p.label}<Arrow/></a>;})}</nav>}
  </div>;
}
function Header({theme,route,searchRef,onSearch}){
  const game=(route.entry||route.category)?.split('/')[0];
  const home=!route.entry&&(!route.view||route.view==='home');
  const activeGame=route.scope==='all'?null:game;
  return <header className="site-header"><a href={href(theme.id)} className="brand" aria-label={theme.id==='ink'?'万象书局 首页':theme.id==='orbital'?'开放图录 首页':'HengBerGer 首页'}>{theme.id==='ink'?<><span className="edition-brand-seal" aria-hidden="true">万</span><span className="edition-brand-name">万象书局<small>HENGBERGER ARCHIVE</small></span></>:theme.id==='orbital'?<><AtlasMark/><span className="atlasx-brand-name">开放图录<small>THE OPEN INDEX</small></span></>:<><Mark/><span>HENG<span className="brand-second">BERGER<sup>®</sup></span></span></>}</a><nav aria-label="主要导航"><a className={home?'active':''} aria-current={home?'page':undefined} href={href(theme.id)}>首页</a>{Object.entries(GAME_NAMES).map(([key,name])=><a key={key} className={activeGame===key?'active':''} aria-current={activeGame===key?'page':undefined} href={href(theme.id,{view:key==='currency'?'season':'world',category:key==='currency'?'currency/season1/roles':`${key}/${key==='zzz'?'agents':'characters'}`})}>{name}</a>)}</nav><form className="header-search" onSubmit={e=>{e.preventDefault();onSearch(e.currentTarget.elements.query.value.trim());}}><SearchIcon/><input ref={searchRef} name="query" aria-label="全站搜索" placeholder="搜索资料"/><kbd>/</kbd></form></header>;
}
function List({theme,data,route,update}){
  const category=route.category||'zzz/agents',all=route.scope==='all';
  const source=data.items.filter(p=>p.category===category),fields=filtersFor(category);
  const filters=Object.fromEntries(Object.entries(route).filter(([k])=>k.startsWith('filter.')).map(([k,v])=>[k.slice(7),v]));
  const clear=()=>update({q:'',filter:'',value:'',page:1,...Object.fromEntries(Object.keys(filters).map(k=>['filter.'+k,'']))});
  const items=selectItems(data.items,{category,q:route.q,filter:route.filter,value:route.value,all,filters});
  const timeline=category.endsWith('/gacha')&&!all;
  const groups=data.groups.filter(g=>g.id.startsWith(category.startsWith('currency/')?category.split('/').slice(0,2).join('/')+'/':category.split('/')[0]+'/'));
  const requestedPage=Number(route.page);
  const page=Math.min(Math.max(1,Number.isFinite(requestedPage)?Math.floor(requestedPage):1),Math.max(1,Math.ceil(items.length/8)));
  const resultsRef=useRef(null);
  const searchState=JSON.stringify([category,all,route.q,route.filter,route.value,page,filters]);
  const previousSearch=useRef(searchState);
  useEffect(()=>{
    if(previousSearch.current===searchState)return;
    previousSearch.current=searchState;
    const focused=document.activeElement;
    if(focused?.matches('.filter-select select')&&resultsRef.current?.closest('.listing-results')?.contains(focused))return;
    resultsRef.current?.focus({preventScroll:true});
    resultsRef.current?.scrollIntoView({block:'start',behavior:'instant'});
  },[searchState]);
  const controls=<form className="filter-bar" onSubmit={e=>{e.preventDefault();update({q:e.currentTarget.elements.q.value,page:1});}}><label className="search-field"><SearchIcon/><input name="q" key={route.q||''} defaultValue={route.q||''} placeholder="按名称或ID查找" aria-label="列表搜索"/></label><button className="small-button" type="submit">查找</button>{!all&&fields.length>0&&<details className="advanced-filters"><summary>筛选{Object.keys(filters).length>0?` · ${Object.keys(filters).length}`:""}</summary><div className="filter-options">{fields.map(f=><label className="filter-select" key={f}><span>{f}</span><select aria-label={f} value={filters[f]||''} onChange={e=>update({['filter.'+f]:e.target.value,filter:'',value:'',page:1})}><option value="">全部</option>{[...new Set(source.flatMap(p=>splitValues(p.fields[f])))].map(v=><option key={v}>{v}</option>)}{source.some(p=>p.fields[f]===undefined||p.fields[f]===null||p.fields[f]==='')&&<option value="__missing__">未提供</option>}</select></label>)}</div></details>}{(route.q||route.filter||Object.keys(filters).length>0)&&<button type="button" className="clear-button" onClick={clear}>清除条件 ×</button>}</form>;
  return <section className={`listing-page listing-${theme.id}`}><header className="page-heading"><div><p className="eyebrow">{all?'SEARCH THE ARCHIVE':GAME_NAMES[category.split('/')[0]]+' / INDEX'}</p><h1>{all?'搜寻你的线索':categoryName(category)+'图鉴'}<sup>{String(items.length).padStart(2,'0')}</sup></h1><p>找到你的下一份发现。</p></div>{category.startsWith('currency/')&&!all&&<SeasonSwitch theme={theme.id} route={route}/>}</header><div className="listing-workspace">{!all&&<div className="listing-categories"><CategoryLinks theme={theme.id} groups={groups} active={category}/></div>}<div className="listing-results">{controls}<h2 className="sr-only">查询结果</h2><div className="result-line" ref={resultsRef} tabIndex={-1}><span aria-live="polite">找到 {items.length} 条资料{items.length>8&&` · 第 ${page} / ${Math.ceil(items.length/8)} 页`}</span><span>设计样本 · 目录共 {all?data.items.length:data.groups.find(g=>g.id===category)?.total||0} 条</span></div>{items.length?<CollectionLayouts items={items.slice((page-1)*8,page*8)} theme={theme.id} timeline={timeline}/>:<div className="empty-state"><span>∅</span><h2>还没有找到这条线索</h2><p>{route.q?`没有找到「${route.q}」。`:"当前筛选条件没有匹配结果。"}试试更短的名称，或清除筛选条件。</p><button className="button" onClick={clear}>查看全部样本 →</button></div>}{items.length>8&&<nav className="pagination" aria-label="结果翻页"><button disabled={page<=1} onClick={()=>update({page:page-1})}>← 上一页</button><form className="page-jump" onSubmit={e=>{e.preventDefault();const n=Number(e.currentTarget.elements.page.value);if(Number.isInteger(n)&&n>=1&&n<=Math.ceil(items.length/8))update({page:n});}}><label>第 <input name="page" type="number" min="1" max={Math.ceil(items.length/8)} key={page} defaultValue={page} aria-label="跳转页码"/> / {Math.ceil(items.length/8)} 页</label><button type="submit">跳转</button></form><button disabled={page>=Math.ceil(items.length/8)} onClick={()=>update({page:page+1})}>下一页 →</button></nav>}</div></div></section>;
}

function Detail({theme,data,route}){
  const meta=data.items.find(p=>p.key===route.entry);
  const resource=useResource(meta?.detailFile);
  if(!meta)return <div className="empty-state"><h1>这条资料尚未收录</h1><a className="button" href={buildReturnHref(theme.id,route,route.category)}>返回图鉴</a></div>;
  if(!resource.data)return <Loading error={resource.error} retry={resource.retry}/>;
  return <DetailLayouts p={resource.data} theme={theme.id} route={route} data={data}/>;
}
export default function DemoApp(){
  const [location,setLocation]=useState(routeFromHash);
  const {data,error,retry}=useResource('/demo-data/index.json');
  const searchRef=useRef(null);
  const previousLocation=useRef(null);
  const theme=THEMES.find(t=>t.id===location.theme);
  const route=Object.fromEntries(location.params);
  useEffect(()=>{const change=()=>setLocation(routeFromHash());window.addEventListener('hashchange',change);return ()=>window.removeEventListener('hashchange',change);},[]);
  useEffect(()=>{
    const previous=window.history.scrollRestoration;
    window.history.scrollRestoration='manual';
    return ()=>{window.history.scrollRestoration=previous;};
  },[]);
  useEffect(()=>{
    if(!data)return;
    const nextRoute=Object.fromEntries(location.params);
    const currentHash=href(location.theme,nextRoute);
    const previous=previousLocation.current;
    previousLocation.current={theme:location.theme,route:nextRoute};
    if(previous?.route.entry&&!nextRoute.entry&&safeReturnHref(currentHash,location.theme)===buildReturnHref(previous.theme,previous.route)){
      const frame=window.requestAnimationFrame(()=>{if(!restoreSourcePosition(currentHash))window.scrollTo({top:0,behavior:'instant'});});
      return ()=>window.cancelAnimationFrame(frame);
    }
    if(!previous||previous.theme!==location.theme||['entry','view','category'].some(key=>previous.route[key]!==nextRoute[key]))window.scrollTo({top:0,behavior:'instant'});
  },[data,location]);
  useEffect(()=>{document.title=theme?.id==='ink'?'万象书局 · HengBerGer Archive':theme?`${theme.name} · HengBerGer`:'HengBerGer · 八种看法';},[theme]);
  useEffect(()=>{const key=e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.isComposing&&!document.activeElement?.isContentEditable&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)){e.preventDefault();searchRef.current?.focus();}};window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[]);
  if(!data)return <div className="boot"><Loading error={error} retry={retry}/></div>;
  if(!theme)return <Gallery data={data}/>;
  const update=changes=>{window.location.hash=href(theme.id,{...route,...changes}).slice(1);};
  return <div className={`demo theme-${theme.id} ${!route.entry&&(!route.view||route.view==='home')?'is-home':'is-inner'}`} data-theme={theme.id}>
    <a className="skip-link" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>跳到主要内容</a>
    <ReviewBar theme={theme} route={route}/><Header theme={theme} route={route} searchRef={searchRef} onSearch={q=>{window.location.hash=href(theme.id,{view:'list',category:'zzz/agents',scope:'all',q}).slice(1);}}/>
    <main id="main" tabIndex={-1} className="demo-main">{route.entry?<Detail key={route.entry} theme={theme} data={data} route={route}/>:route.view==='season'?<WorldLayouts theme={theme.id} data={data} route={route} season/>:route.view==='world'?<WorldLayouts theme={theme.id} data={data} route={route}/>:route.view==='list'?<List theme={theme} data={data} route={route} update={update}/>:<Home theme={theme} data={data}/>}</main>
    <footer className="site-footer"><a className="brand" href={href(theme.id)}>{theme.id==='ink'?<><span className="edition-brand-seal" aria-hidden="true">万</span><span className="edition-brand-name">万象书局<small>HENGBERGER ARCHIVE</small></span></>:theme.id==='orbital'?<><AtlasMark/><span className="atlasx-brand-name">开放图录<small>THE OPEN INDEX</small></span></>:<><Mark/>HengBerGer</>}</a><p>{theme.id==='ink'?'把喜欢的世界，读得更深一点。':theme.id==='orbital'?'向每一份好奇心开放。':theme.tag}</p><span className="mono">资料快照 · {data.generatedAt?.slice(0,10).replaceAll('-','.')||'日期未注明'}<br/>为每一份好奇心而整理</span><a href="#/">探索其他设计 <Arrow/></a></footer>
  </div>;
}
