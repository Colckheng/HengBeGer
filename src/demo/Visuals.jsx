import {useState} from 'react';
import artworks from './artworks.json';
import {href, tags, categoryName} from './model.js';
import {buildEntryHref,rememberSourcePosition} from './navigation.js';

export function Cover({world, className=''}) {
  return <figure className={`cover cover-${world.id} ${className}`} style={{'--focus':world.position,'--world-color':world.color}}><img src={`/demo-art/covers/${world.id}.png`} alt={world.subject} fetchPriority="high"/><figcaption>{world.en}</figcaption></figure>;
}
export function Asset({item,large=false,mode='art'}) {
  const [failed,setFailed]=useState(false);
  const full=mode==='art'&&artworks[item.key]?.usage!=='emblem'&&artworks[item.key]?.src;
  const src=full||item.image;
  const kind=item.category.split('/').at(-1);
  if(['formula','gacha'].includes(kind))return <div className={`asset asset-${kind} asset-type`} aria-hidden="true"><span>{kind==='formula'?'∑':'日'}</span><small>{kind==='formula'?'FIELD NOTES':'EVENT ARCHIVE'}</small></div>;
  return <div className={`asset asset-${kind} ${full?'asset-illustration':'asset-icon'} ${src&&!failed?'':'asset-missing'}`} data-asset-key={item.key}>
    {src&&!failed?<img src={src} alt={item.name} loading={large?'eager':'lazy'} onError={()=>setFailed(true)}/>:<><span aria-hidden="true">◇</span><small>暂无图片</small></>}
  </div>;
}
export function Labels({item}){return <div className="tag-row">{tags(item).map(t=><span key={t}>{t}</span>)}</div>;}
export function EntryLink({item,theme,children,className=''}){return <a className={`entry-link ${className}`} data-entry-link={item.key} href={buildEntryHref(theme,item)} onClick={()=>rememberSourcePosition(item.key)} onAuxClick={()=>rememberSourcePosition(item.key)}>{children}</a>;}
export function EntryTile({item,theme,index=0}){return <EntryLink item={item} theme={theme} className="entry-tile"><span className="tile-no">{String(index+1).padStart(2,'0')}</span><Asset item={item}/><div className="tile-caption"><small>{categoryName(item.category)} / {item.id}</small><h3>{item.name}</h3><Labels item={item}/><span className="tile-arrow" aria-hidden="true">↗</span></div></EntryLink>;}
export function CategoryLinks({theme,groups,active}){return <nav className="category-links" aria-label="资料分类">{groups.map((g,i)=><a className={active===g.id?'active':''} aria-current={active===g.id?'page':undefined} key={g.id} href={href(theme,{view:'list',category:g.id})}><span>{String(i+1).padStart(2,'0')}</span><strong>{categoryName(g.id)}</strong><small>{g.total??g.count} 条资料</small><b aria-hidden="true">↗</b></a>)}</nav>;}
export function SeasonSwitch({theme,route}){const season=route.category?.split('/')[1]||'season1';return <nav className="season-switch" aria-label="赛季切换">{[1,2].map(n=><a key={n} aria-current={season===`season${n}`?'page':undefined} className={season===`season${n}`?'active':''} href={href(theme,{view:route.view||'season',category:`currency/season${n}/${route.category?.split('/')[2]||'roles'}`})}>S{n}<span>第{n===1?'一':'二'}赛季{season===`season${n}`?' · 当前':''}</span></a>)}</nav>;}
export function SectionLabel({children,number='01',en='THE COLLECTION'}){return <div className="section-label"><span>{number} / {en}</span><h2>{children}</h2></div>;}
