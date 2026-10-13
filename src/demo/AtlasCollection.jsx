import {useState} from 'react';
import {Asset, EntryLink} from './Visuals.jsx';
import {categoryName, dateLabel, tags} from './model.js';
import {GAME_NAMES} from './themes.js';
import artworks from './artworks.json';

const VIEW_KEY = 'open-index:collection-view';

function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function ViewIcon({list}) {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">{list ? <path d="M3 5h2m3 0h9M3 10h2m3 0h9M3 15h2m3 0h9" stroke="currentColor" strokeWidth="1.5"/> : <><rect x="3" y="3" width="5" height="5" stroke="currentColor" strokeWidth="1.3"/><rect x="12" y="3" width="5" height="5" stroke="currentColor" strokeWidth="1.3"/><rect x="3" y="12" width="5" height="5" stroke="currentColor" strokeWidth="1.3"/><rect x="12" y="12" width="5" height="5" stroke="currentColor" strokeWidth="1.3"/></>}</svg>;
}

function nameVariant(item) {
  const fields = item.fields || {};
  if (item.category === 'hsr/characters' && ['三月七', '开拓者'].includes(item.name)) return fields.命途 || '';
  if (item.category.endsWith('/roles') && fields.星阶) return `${fields.星阶} 阶`;
  return '';
}

function AtlasFigure({item, index}) {
  const kind = item.category.split('/').at(-1);
  if (kind === 'formula') return <div className="atlasx-figure atlasx-figure-formula" aria-hidden="true"><span className="atlasx-diagram-grid"/><span className="atlasx-formula-mark">ƒ<span>(x)</span></span><small>机制笔记 / FIELD NOTES</small></div>;
  if (kind === 'gacha') {
    const start = String(item.fields?.start_time || item.fields?.start_time_text || '');
    const date = start.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    return <div className="atlasx-figure atlasx-figure-event" aria-hidden="true"><span className="atlasx-event-label">活动档案 / EVENT</span>{date ? <><span className="atlasx-event-day">{date[2].padStart(2, '0')}<i>/</i>{date[3].padStart(2, '0')}</span><small>{date[1]}</small></> : <><span className="atlasx-event-day">日历</span><small>查阅时间记录</small></>}</div>;
  }
  const hasImage = item.image || (artworks[item.key]?.usage !== 'emblem' && artworks[item.key]?.src);
  return <div className={`atlasx-figure atlasx-figure-art ${hasImage ? '' : 'atlasx-figure-no-image'}`} data-initial={Array.from(item.name)[0]} aria-hidden="true"><span className="atlasx-figure-coordinate">FIG. {String(index + 1).padStart(2, '0')}</span>{hasImage ? <Asset item={item}/> : <div className="atlasx-lettermark"><span>{Array.from(item.name)[0]}</span><small>暂无插图</small></div>}<span className="atlasx-figure-axis"/></div>;
}

function AtlasCard({item, index, mixed}) {
  const variant = nameVariant(item);
  const kind = item.category.split('/').at(-1);
  const labels = tags(item).filter(tag => tag !== variant).slice(0, 3);
  return <EntryLink item={item} theme="orbital" className={`atlasx-card atlasx-card-${kind}`}><AtlasFigure item={item} index={index}/><div className="atlasx-card-copy"><div className="atlasx-card-kicker"><span>{mixed ? `${GAME_NAMES[item.category.split('/')[0]]} · ${categoryName(item.category)}` : categoryName(item.category)}</span><span className="atlasx-card-id">#{item.id}</span></div><h3>{item.name}{variant && <span className="atlasx-card-variant"> / {variant}</span>}</h3>{kind === 'gacha' ? <p className="atlasx-card-date">{dateLabel(item)}</p> : <div className="atlasx-card-tags">{labels.length ? labels.map(tag => <span key={tag}>{tag}</span>) : <span>{kind === 'formula' ? '公式 · 定义 · 计算口径' : categoryName(item.category)}</span>}</div>}</div><span className="atlasx-card-action"><span>查阅档案</span><Arrow/></span></EntryLink>;
}

export default function AtlasCollection({items}) {
  const [view, setView] = useState(() => {
    try { return sessionStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  if (!items.length) return null;
  const mixed = new Set(items.map(item => item.category)).size > 1;
  const changeView = value => {
    setView(value);
    try { sessionStorage.setItem(VIEW_KEY, value); } catch { /* Browsing stays available when storage is disabled. */ }
  };
  return <section className={`atlasx-collection atlasx-view-${view}`} aria-label="档案图录"><div className="atlasx-collection-toolbar"><span className="atlasx-collection-count">{view === 'grid' ? '图版浏览' : '目录浏览'}</span><div className="atlasx-view-switch" role="group" aria-label="图鉴显示方式"><button type="button" aria-pressed={view === 'grid'} onClick={() => changeView('grid')}><ViewIcon/>图版</button><button type="button" aria-pressed={view === 'list'} onClick={() => changeView('list')}><ViewIcon list/>列表</button></div></div><div className="atlasx-cards">{items.map((item, index) => <AtlasCard key={item.key} item={item} index={index} mixed={mixed}/>)}</div></section>;
}
