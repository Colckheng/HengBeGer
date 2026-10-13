import {Asset, EntryLink, SeasonSwitch} from './Visuals.jsx';
import AtlasCollection from './AtlasCollection.jsx';
import {categoryName, href, tags} from './model.js';
import {GAME_NAMES} from './themes.js';
import {WORLDS, worldHref} from './worlds.js';

const THEME = 'orbital';
const WORLDS_COPY = {
  zzz: {art: '/demo-art/zzz-1011.png', subject: '安比', line: '都市的另一面，从相遇开始。', categories: ['agents', 'sound_engines', 'bangboo']},
  hsr: {art: '/demo-art/hsr-1224.png', subject: '三月七', line: '沿着星轨，发现新的可能。', categories: ['characters', 'light_cones', 'relics']},
  currency: {art: '/demo-art/hsr-1502.png', subject: '爻光', line: '读懂规则，让组合产生回响。', categories: ['roles', 'traits', 'strategies']},
};
export function AtlasArrow({diagonal = false}) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/></svg>;
}
export function AtlasMark() {
  return <svg className="atlasx-mark" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M5 17V5h12M23 5h12v12M35 23v12H23M17 35H5V23" stroke="currentColor" strokeWidth="3"/><path d="M12 20h16M20 12v16" stroke="currentColor" strokeWidth="2"/></svg>;
}
export function AtlasHome({data}) {
  const reading = ['hsr/characters/1415', 'zzz/agents/1011', 'hsr/formula/hsr-formula-damage'].map(key => data.items.find(p => p.key === key)).filter(Boolean);
  const search = e => {
    e.preventDefault();
    window.location.hash = href(THEME, {view: 'list', category: 'hsr/characters', scope: 'all', q: e.currentTarget.elements.query.value.trim()}).slice(1);
  };
  return <section className="atlasx-home">
    <div className="atlasx-topline"><span>AN OPEN WORLD. <i>开放图录</i></span><span>人物 / 器物 / 游戏的另一面</span><span>INDEX — 2026</span></div>
    <header className="atlasx-home-hero"><div><h1>把世界，<br/><span>展开来看。</span><span className="atlasx-title-cross" aria-hidden="true">↗</span></h1></div><div className="atlasx-home-tools"><p>从一个名字，找到一整个世界的线索。<br/>角色、装备与机制，在这里一一展开。</p><form className="atlasx-home-search" onSubmit={search}><label className="sr-only" htmlFor="atlasx-query">搜索全部图录</label><input id="atlasx-query" name="query" placeholder="输入名字，开始探索"/><button type="submit" aria-label="搜索图录"><AtlasArrow/></button></form><div className="atlasx-search-hints"><span>试着查找</span>{reading.slice(0, 2).map(p => <EntryLink key={p.key} item={p} theme={THEME}>{p.name} ↗</EntryLink>)}</div></div></header>
    <div className="atlasx-section-heading"><h2><span>01 /</span> 选择一个世界</h2><span>03 COLLECTIONS <i>向好奇心开放</i></span></div>
    <div className="atlasx-portals">{WORLDS.map((w, i) => {
      const copy = WORLDS_COPY[w.id], base = w.id === 'currency' ? 'currency/season1' : w.id;
      const count = data.items.filter(p => p.category.startsWith(base + '/')).length;
      return <article className={`atlasx-portal atlasx-portal-${w.id}`} key={w.id}><a className="atlasx-portal-main" data-world={w.id} href={worldHref(THEME, w)}><div className="atlasx-portal-visual"><span className="atlasx-portal-number" aria-hidden="true">0{i + 1}</span><img src={`/demo-art/covers/${w.id}.png`} alt={w.subject} fetchPriority={i === 0 ? 'high' : 'auto'}/><span className="atlasx-portal-registration" aria-hidden="true">＋</span></div><div className="atlasx-portal-copy"><small>{w.en}</small><h3>{w.name}<AtlasArrow diagonal/></h3><p>{copy.line}</p><span className="atlasx-portal-count">{count} 份可读档案{w.id === 'currency' && ' · 第一赛季'}</span></div></a><nav aria-label={`${w.name}快捷分类`}>{copy.categories.map(c => <a key={c} href={href(THEME, {view: 'list', category: `${base}/${c}`})}>{categoryName(c)}<span aria-hidden="true">↗</span></a>)}</nav></article>;
    })}</div>
    <section className="atlasx-discover"><div className="atlasx-section-heading"><h2><span>02 /</span> 顺着线索，继续发现</h2><a href={href(THEME, {view: 'list', category: 'hsr/characters', scope: 'all'})}>全部 {data.items.length} 份档案 <AtlasArrow/></a></div><div className="atlasx-discover-grid">{reading.map((p, i) => <EntryLink item={p} theme={THEME} key={p.key} className="atlasx-discover-record"><div className="atlasx-discover-top"><span>FILE / 0{i + 1}</span><AtlasArrow diagonal/></div><Asset item={p} mode="icon"/><div><small>{GAME_NAMES[p.category.split('/')[0]]} / {categoryName(p.category)}</small><h3>{p.name}</h3><p>{tags(p).join(' · ') || '从公式出发，理解每一份数值。'}</p></div></EntryLink>)}</div></section>
    <div className="atlasx-about"><AtlasMark/><div><h2>每一份好奇，都有出处。</h2><p>图录保留资料来源、收录日期与数值口径。当前开放 {data.items.length} 份代表性资料，供你浏览与查阅。</p></div><span>OPEN TO<br/>CURIOSITY.</span></div>
  </section>;
}
export function AtlasWorld({data, route, season = false}) {
  const id = season ? 'currency' : route.category?.split('/')[0] || 'zzz';
  const world = WORLDS.find(w => w.id === id) || WORLDS[0], copy = WORLDS_COPY[world.id];
  const base = season ? route.category?.split('/').slice(0, 2).join('/') || 'currency/season1' : world.id;
  const groups = data.groups.filter(g => g.id.startsWith(base + '/'));
  const category = season ? `${base}/roles` : world.category;
  const items = data.items.filter(p => p.category === category);
  const count = data.items.filter(p => p.category.startsWith(base + '/')).length;
  return <section className="atlasx-world-page" data-world-layout="orbital"><div className="atlasx-world-breadcrumb"><a href={href(THEME)}>开放图录</a><span>/</span><span>{world.name}</span></div><header className="atlasx-world-heading"><div><span className="atlasx-kicker">COLLECTION 0{WORLDS.indexOf(world) + 1} / {world.en}</span><h1>{world.name}<span>{season ? `第${base.endsWith('season2') ? '二' : '一'}赛季` : '世界图录'}</span></h1><p>{copy.line}</p>{season && <SeasonSwitch theme={THEME} route={route}/>}<div className="atlasx-world-counts"><span><b>{String(count).padStart(2, '0')}</b> 可读档案</span><span><b>{String(groups.length).padStart(2, '0')}</b> 资料分类</span></div></div><figure className={`atlasx-world-art atlasx-portal-${world.id}`}><span aria-hidden="true">0{WORLDS.indexOf(world) + 1}</span><img src={copy.art} alt={`${copy.subject}角色插图`}/></figure></header><div className="atlasx-world-body"><div className="atlasx-world-directory"><h2>图录目录 <span>INDEX</span></h2><nav aria-label="资料分类">{groups.map((g, i) => <a key={g.id} href={href(THEME, {view: 'list', category: g.id})}><span>{String(i + 1).padStart(2, '0')}</span><strong>{categoryName(g.id)}</strong><small>{g.count}</small><AtlasArrow/></a>)}</nav><p>数字为本次可读档案数。<br/>完整目录持续收录中。</p></div><div><div className="atlasx-section-heading"><h2>{season ? '本季人物' : '从人物开始'}</h2><a href={href(THEME, {view: 'list', category})}>全部{categoryName(category)} <AtlasArrow/></a></div><AtlasCollection items={items}/><a className="atlasx-reading-link" href={href(THEME, {view: 'list', category: season ? `${base}/strategies` : `${world.id}/formula`})}><span><small>BEYOND THE NUMBERS</small><strong>{season ? '下一步，读懂投资策略。' : '再进一步，理解世界的规则。'}</strong></span><AtlasArrow diagonal/></a></div></div></section>;
}
