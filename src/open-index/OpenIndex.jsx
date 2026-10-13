import {useEffect, useRef, useState} from 'react';
import './open-index.css';
import {categoryName, filtersFor, splitValues, selectItems} from '../demo/model.js';
import {GAME_NAMES} from '../demo/themes.js';
import {CategoryLinks, SeasonSwitch} from '../demo/Visuals.jsx';
import {AtlasHome, AtlasMark, AtlasWorld} from '../demo/AtlasEdition.jsx';
import AtlasCollection from '../demo/AtlasCollection.jsx';
import AtlasDetail from '../demo/AtlasDetail.jsx';
import {buildReturnHref, restoreSourcePosition, safeReturnHref} from '../demo/navigation.js';
import {COPY, SITE, THEME} from './copy.js';
import {entryUrl, INDEX_URL, pageHref, updatePage, usePageRoute} from './page.js';

const PAGE_SIZE = 8;
const cache = new Map();

function useResource(url) {
  const [state, setState] = useState({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!url || cache.has(url)) return;
    const controller = new AbortController();
    fetch(url, {signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw Error('资料暂时没有加载成功');
        return response.json();
      })
      .then(data => {
        cache.set(url, data);
        setState({url, data});
      })
      .catch(error => {
        if (error.name !== 'AbortError') setState({url, error: error.message});
      });
    return () => controller.abort();
  }, [url, retry]);
  return {
    data: cache.get(url) || (state.url === url ? state.data : null),
    error: state.url === url ? state.error : null,
    retry: () => {
      setState({});
      setRetry(count => count + 1);
    },
  };
}

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function SearchIcon() {
  return <svg className="search-glyph" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.5"/></svg>;
}

function Loading({error, retry}) {
  return <div className="loading-panel" role={error ? 'alert' : 'status'}><span className="loading-mark">H/B</span><h2>{error ? '这一页稍后再试' : '正在展开资料…'}</h2>{error && <button className="button" onClick={retry}>重新加载 <Arrow/></button>}</div>;
}

function Header({route, searchRef, onSearch}) {
  const game = (route.entry || route.category)?.split('/')[0];
  const home = !route.entry && (!route.view || route.view === 'home');
  const activeGame = route.scope === 'all' ? null : game;
  const nav = [
    {key: 'zzz', href: pageHref({view: 'world', category: 'zzz/agents'})},
    {key: 'hsr', href: pageHref({view: 'world', category: 'hsr/characters'})},
    {key: 'currency', href: pageHref({view: 'season', category: 'currency/season1/roles'})},
  ];
  return <header className="site-header">
    <a href={pageHref()} className="brand" aria-label="开放图录 首页"><AtlasMark/><span className="atlasx-brand-name">{SITE.name}<small>{SITE.en}</small></span></a>
    <nav aria-label="主要导航"><a className={home ? 'active' : ''} aria-current={home ? 'page' : undefined} href={pageHref()}>首页</a>{nav.map(item => <a key={item.key} className={activeGame === item.key ? 'active' : ''} aria-current={activeGame === item.key ? 'page' : undefined} href={item.href}>{GAME_NAMES[item.key]}</a>)}</nav>
    <form className="header-search" onSubmit={event => {event.preventDefault(); onSearch(event.currentTarget.elements.query.value.trim());}}><SearchIcon/><input ref={searchRef} name="query" aria-label="全站搜索" placeholder="搜索资料"/><kbd>/</kbd></form>
  </header>;
}

function List({data, route}) {
  const category = route.category || 'zzz/agents';
  const all = route.scope === 'all';
  const source = data.items.filter(item => item.category === category);
  const fields = filtersFor(category);
  const filters = Object.fromEntries(Object.entries(route).filter(([key]) => key.startsWith('filter.')).map(([key, value]) => [key.slice(7), value]));
  const clear = () => updatePage(route, {q: '', filter: '', value: '', page: 1, ...Object.fromEntries(Object.keys(filters).map(key => ['filter.' + key, '']))});
  const items = selectItems(data.items, {category, q: route.q, filter: route.filter, value: route.value, all, filters});
  const timeline = category.endsWith('/gacha') && !all;
  const groups = data.groups.filter(group => group.id.startsWith(category.startsWith('currency/') ? category.split('/').slice(0, 2).join('/') + '/' : category.split('/')[0] + '/'));
  const requestedPage = Number(route.page);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1), pages);
  const resultsRef = useRef(null);
  const searchState = JSON.stringify([category, all, route.q, route.filter, route.value, page, filters]);
  const previousSearch = useRef(searchState);
  useEffect(() => {
    if (previousSearch.current === searchState) return;
    previousSearch.current = searchState;
    const focused = document.activeElement;
    if (focused?.matches('.filter-select select') && resultsRef.current?.closest('.listing-results')?.contains(focused)) return;
    resultsRef.current?.focus({preventScroll: true});
    resultsRef.current?.scrollIntoView({block: 'start', behavior: 'instant'});
  }, [searchState]);
  const total = all ? data.items.length : data.groups.find(group => group.id === category)?.total || 0;
  const controls = <form className="filter-bar" onSubmit={event => {event.preventDefault(); updatePage(route, {q: event.currentTarget.elements.q.value, page: 1});}}>
    <label className="search-field"><SearchIcon/><input name="q" key={route.q || ''} defaultValue={route.q || ''} placeholder="按名称或ID查找" aria-label="列表搜索"/></label>
    <button className="small-button" type="submit">查找</button>
    {!all && fields.length > 0 && <details className="advanced-filters"><summary>筛选{Object.keys(filters).length > 0 ? ` · ${Object.keys(filters).length}` : ''}</summary><div className="filter-options">{fields.map(field => <label className="filter-select" key={field}><span>{field}</span><select aria-label={field} value={filters[field] || ''} onChange={event => updatePage(route, {['filter.' + field]: event.target.value, filter: '', value: '', page: 1})}><option value="">全部</option>{[...new Set(source.flatMap(item => splitValues(item.fields[field])))].map(value => <option key={value}>{value}</option>)}{source.some(item => item.fields[field] === undefined || item.fields[field] === null || item.fields[field] === '') && <option value="__missing__">未提供</option>}</select></label>)}</div></details>}
    {(route.q || route.filter || Object.keys(filters).length > 0) && <button type="button" className="clear-button" onClick={clear}>清除条件 ×</button>}
  </form>;
  return <section className={`listing-page listing-${THEME}`}>
    <header className="page-heading"><div><p className="eyebrow">{all ? 'SEARCH THE ARCHIVE' : `${GAME_NAMES[category.split('/')[0]]} / INDEX`}</p><h1>{all ? '搜寻你的线索' : `${categoryName(category)}图鉴`}<sup>{String(items.length).padStart(2, '0')}</sup></h1><p>找到你的下一份发现。</p></div>{category.startsWith('currency/') && !all && <SeasonSwitch theme={THEME} route={route}/>}</header>
    <div className="listing-workspace">
      {!all && <div className="listing-categories"><CategoryLinks theme={THEME} groups={groups} active={category}/></div>}
      <div className="listing-results">
        {controls}
        <h2 className="sr-only">查询结果</h2>
        <div className="result-line" ref={resultsRef} tabIndex={-1}><span aria-live="polite">找到 {items.length} 条资料{items.length > PAGE_SIZE && ` · 第 ${page} / ${pages} 页`}</span><span>{COPY.listTotal(total)}</span></div>
        {items.length ? <AtlasCollection items={items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}/> : <div className="empty-state"><span>∅</span><h2>还没有找到这条线索</h2><p>{route.q ? `没有找到「${route.q}」。` : '当前筛选条件没有匹配结果。'}试试更短的名称，或清除筛选条件。</p><button className="button" onClick={clear}>查看全部资料 →</button></div>}
        {items.length > PAGE_SIZE && <nav className="pagination" aria-label="结果翻页"><button disabled={page <= 1} onClick={() => updatePage(route, {page: page - 1})}>← 上一页</button><form className="page-jump" onSubmit={event => {event.preventDefault(); const next = Number(event.currentTarget.elements.page.value); if (Number.isInteger(next) && next >= 1 && next <= pages) updatePage(route, {page: next});}}><label>第 <input name="page" type="number" min="1" max={pages} key={page} defaultValue={page} aria-label="跳转页码"/> / {pages} 页</label><button type="submit">跳转</button></form><button disabled={page >= pages} onClick={() => updatePage(route, {page: page + 1})}>下一页 →</button></nav>}
      </div>
    </div>
    {timeline && <p className="event-key">活动记录与版本阶段汇总 · 日期保留来源口径</p>}
  </section>;
}

function Detail({data, route}) {
  const meta = data.items.find(item => item.key === route.entry);
  // /api/catalog/entry returns the cleaned body plus its "## " section split,
  // i.e. exactly what the reviewed design renders (see entryUrl in page.js).
  const resource = useResource(meta ? entryUrl(meta.key) : null);
  if (!meta) return <div className="empty-state"><h1>这条资料尚未收录</h1><a className="button" href={buildReturnHref(THEME, route, route.category)}>返回图鉴</a></div>;
  if (!resource.data) return <Loading error={resource.error} retry={resource.retry}/>;
  return <AtlasDetail p={resource.data} theme={THEME} route={route} data={data}/>;
}

export default function OpenIndex() {
  const route = usePageRoute();
  const {data, error, retry} = useResource(INDEX_URL);
  const searchRef = useRef(null);
  const previousRoute = useRef(null);
  const home = !route.entry && (!route.view || route.view === 'home');

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {window.history.scrollRestoration = previous;};
  }, []);

  useEffect(() => {
    if (!data) return;
    const currentHash = pageHref(route);
    const previous = previousRoute.current;
    previousRoute.current = {route};
    if (previous?.route.entry && !route.entry && safeReturnHref(currentHash, THEME) === buildReturnHref(THEME, previous.route)) {
      const frame = window.requestAnimationFrame(() => {if (!restoreSourcePosition(currentHash)) window.scrollTo({top: 0, behavior: 'instant'});});
      return () => window.cancelAnimationFrame(frame);
    }
    if (!previous || ['entry', 'view', 'category'].some(key => previous.route[key] !== route[key])) window.scrollTo({top: 0, behavior: 'instant'});
  }, [data, route]);

  useEffect(() => {
    document.title = `${SITE.name} · HengBerGer`;
  }, []);

  useEffect(() => {
    const focusSearch = event => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !document.activeElement?.isContentEditable && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const snapshot = data?.generatedAt?.slice(0, 10).replaceAll('-', '.') || '日期未注明';

  return <div className={`demo theme-${THEME} open-index ${home ? 'is-home' : 'is-inner'}`} data-theme={THEME}>
    <a className="skip-link" href="#open-index-main" onClick={event => {event.preventDefault(); document.getElementById('open-index-main')?.focus();}}>跳到主要内容</a>
    <Header route={route} searchRef={searchRef} onSearch={q => updatePage(route, {entry: '', view: 'list', category: 'zzz/agents', scope: 'all', q})}/>
    <main id="open-index-main" tabIndex={-1} className="demo-main">
      {!data ? <Loading error={error} retry={retry}/> : route.entry
        ? <Detail key={route.entry} data={data} route={route}/>
        : route.view === 'season' ? <AtlasWorld data={data} route={route} season/>
          : route.view === 'world' ? <AtlasWorld data={data} route={route}/>
            : route.view === 'list' ? <List data={data} route={route}/>
              : <AtlasHome data={data}/>}
    </main>
    <footer className="site-footer">
      <a className="brand" href={pageHref()}><AtlasMark/><span className="atlasx-brand-name">{SITE.name}<small>{SITE.en}</small></span></a>
      <p>{SITE.tag}</p>
      <span className="mono">资料快照 · {snapshot}<br/>为每一份好奇心而整理</span>
    </footer>
  </div>;
}
