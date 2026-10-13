import {useRef, useState} from 'react';
import {Asset, EntryLink, Labels, SeasonSwitch} from './Visuals.jsx';
import ReaderSection from './ReaderLoader.jsx';
import {categoryName, dateLabel, href, infoFields, statFields, tags} from './model.js';
import {prepareSections, SECTION_GROUPS} from './contentModel.js';
import {buildReturnHref} from './navigation.js';
import {GAME_NAMES} from './themes.js';
import {WORLDS, worldHref} from './worlds.js';
import artworks from './artworks.json';

const THEME = 'ink';
const WORLD_COPY = {
  zzz: {chapter: '01', title: '在新艾利都，找到你的同伴。', detail: '代理人、音擎与邦布的随身资料册。', art: '/demo-art/zzz-1011.png', subject: '安比', categories: ['agents', 'sound_engines', 'bangboo']},
  hsr: {chapter: '02', title: '循着星轨，翻开下一页。', detail: '从角色行迹到光锥遗器，记录旅途的细节。', art: '/demo-art/hsr-1224.png', subject: '三月七', categories: ['characters', 'light_cones', 'relics']},
  currency: {chapter: '03', title: '每一种组合，都值得推演。', detail: '角色、羁绊与投资策略，按赛季分卷收录。', art: '/demo-art/hsr-1001.png', subject: '三月七', categories: ['roles', 'traits', 'strategies']},
};

function Arrow({down = false}) {
  return <svg className="edition-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={down ? 'M12 4v16m-6-6 6 6 6-6' : 'M5 12h14m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function EditionLabel({children, number}) {
  return <span className="edition-label">{number && <span className="edition-number">{number}</span>}{children}</span>;
}

function EntryName({item}) {
  const variant = item.category === 'hsr/characters' && ['三月七', '开拓者'].includes(item.name) ? item.fields.命途 : item.category.endsWith('/roles') && item.fields.星阶 ? `${item.fields.星阶} 阶` : '';
  return <>{item.name}{variant && <span className="edition-name-variant"> · {variant}</span>}</>;
}

function EditionAsset({item, large = false, mode = 'art'}) {
  if (item.image || (mode === 'art' && artworks[item.key]?.src) || /\/(formula|gacha)$/.test(item.category)) return <Asset item={item} large={large} mode={mode}/>;
  return <div className="asset edition-cover-placeholder" role="img" aria-label={`${item.name}，来源尚未提供插图`}><span aria-hidden="true">{Array.from(item.name)[0]}</span><small aria-hidden="true">{item.id}</small></div>;
}

function SourceNote({p}) {
  const f = p.fields;
  const captured = (f.last_crawled_at || f.captured_at || '').slice(0, 10);
  return <details className="edition-source"><summary><span>来源与收录说明</span><span aria-hidden="true">＋</span></summary><div><p>来源：{f.source || '未注明'}{captured && ` · 收录于 ${captured}`}</p>{f.source_url && <a href={f.source_url} target="_blank" rel="noreferrer">查阅原始来源 ↗</a>}<p>数值保留来源口径；收录日期不代表游戏版本。不同等级、形态与来源的数据，请结合章节说明阅读。</p>{p.key === 'hsr/light_cones/20000' && <p>数值差异：来源字段的生命 / 攻击 / 防御为 846 / 317 / 264，正文等级 80 表为 847 / 318 / 265。两组数据均保留原始值，差异原因尚未确认。</p>}{p.sourceCheck?.scope && <p>{p.sourceCheck.scope}</p>}{f.author && <p>作者：{f.author}</p>}{f.license && <p>内容许可：{f.license}</p>}{p.sections.filter(s => s.title.includes('补充核验')).map(s => <details key={s.id}><summary>{s.title}</summary><pre>{s.body}</pre></details>)}</div></details>;
}

export function InkHome({data}) {
  const featured = data.items.find(p => p.key === 'hsr/characters/1224');
  const reading = ['hsr/characters/1415', 'zzz/agents/1011', 'hsr/formula/hsr-formula-damage'].map(key => data.items.find(p => p.key === key)).filter(Boolean);
  const search = e => {
    e.preventDefault();
    const q = e.currentTarget.elements.query.value.trim();
    window.location.hash = href(THEME, {view: 'list', scope: 'all', category: 'hsr/characters', q}).slice(1);
  };
  return <section className="edition-home">
    <div className="edition-colophon"><EditionLabel>一间关于游戏的书局</EditionLabel><span>人物 · 器物 · 世界</span><span className="edition-mono">EST. 2026 / VOL. 01</span></div>
    <div className="edition-hero">
      <div className="edition-hero-copy"><span className="edition-overline"><i/> THE LIVING ARCHIVE</span><h1>在万象之间，<br/>读懂每一份<span>热爱。</span></h1><p>把喜欢的世界，放在手边。<br/>查阅角色、装备与机制，让每一次探索都有迹可循。</p><form className="edition-home-search" onSubmit={search}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.5"/></svg><input name="query" aria-label="查阅全站资料" placeholder="搜一个名字，开启一页故事"/><button type="submit">查阅 <Arrow/></button></form><div className="edition-quick-search"><span>从这里开始</span>{reading.map(p => <EntryLink item={p} theme={THEME} key={p.key}>{p.name}<span aria-hidden="true">↗</span></EntryLink>)}</div></div>
      <div className="edition-hero-art"><div className="edition-art-border"/><span className="edition-art-volume">卷二 / 星穹铁道</span><span className="edition-art-ideograph" aria-hidden="true">遇</span><img src="/demo-art/hsr-1224.png" alt="三月七，持剑而行的旅途瞬间" fetchPriority="high"/><span className="edition-art-caption">每一次相遇，都有新的篇章。</span>{featured && <EntryLink item={featured} theme={THEME} className="edition-feature-link"><span><small>本期人物 / FEATURED</small><strong>三月七 <span>· 巡猎</span></strong></span><Arrow/></EntryLink>}</div>
    </div>
    <div className="edition-section-head"><div><EditionLabel number="壹">分卷而读</EditionLabel><h2>你想从哪个世界开始？</h2></div><span className="edition-section-note">三个世界，各有一册。</span></div>
    <div className="edition-worlds">{WORLDS.map(w => {
      const copy = WORLD_COPY[w.id], base = w.id === 'currency' ? 'currency/season1' : w.id;
      const count = data.items.filter(p => p.category.startsWith(base + '/')).length;
      return <article className={`edition-world-card edition-world-${w.id}`} key={w.id}><a className="edition-world-card-main" href={worldHref(THEME, w)}><span className="edition-world-no">{copy.chapter} <i>/</i></span><div><small>{w.en}</small><h3>{w.name}</h3><p>{copy.detail}</p><span className="edition-world-enter">翻开这一卷 <Arrow/></span></div><img src={copy.art} alt="" loading="lazy"/><span className="edition-world-count">{count} 份可读档案</span></a><nav aria-label={`${w.name}快捷分类`}>{copy.categories.map(c => <a key={c} href={href(THEME, {view: 'list', category: `${base}/${c}`})}>{categoryName(c)} <span aria-hidden="true">↗</span></a>)}</nav></article>;
    })}</div>
    <div className="edition-reading-desk"><div className="edition-desk-intro"><EditionLabel number="贰">案头常阅</EditionLabel><h2>从一份档案，<br/>到一个新发现。</h2><p>人物的另一面，藏在细节里。</p></div><div className="edition-desk-records">{reading.map((p, i) => <EntryLink item={p} theme={THEME} className="edition-desk-record" key={p.key}><span className="edition-mono">0{i + 1}</span><EditionAsset item={p} mode="icon"/><span><small>{GAME_NAMES[p.category.split('/')[0]]} / {categoryName(p.category)}</small><strong>{p.name}</strong><em>{tags(p).join(' · ') || '公式、定义与计算口径'}</em></span><Arrow/></EntryLink>)}</div></div>
    <div className="edition-trust-note"><span className="edition-trust-seal" aria-hidden="true">录</span><p><strong>有所收录，亦有所依据。</strong><span>每份档案保留来源与等级口径。当前开放 {data.items.length} 份代表性资料，持续整理中。</span></p><a href={href(THEME, {view: 'list', category: 'hsr/characters', scope: 'all'})}>浏览全部档案 <Arrow/></a></div>
  </section>;
}

export function InkCollection({items}) {
  const mixed = new Set(items.map(p => p.category)).size > 1;
  return <div className="edition-records"><div className="edition-record-head" aria-hidden="true"><span>档案 / NAME</span><span>{mixed ? '所属分类' : '属性与特征'}</span><span>档案编号</span><span>查阅</span></div>{items.map((p, i) => <EntryLink key={p.key} item={p} theme={THEME} className="edition-record"><span className="edition-record-identity"><span className="edition-record-no">{String(i + 1).padStart(2, '0')}</span><EditionAsset item={p} mode="icon"/><span><small>{GAME_NAMES[p.category.split('/')[0]]} · {categoryName(p.category)}</small><h3><EntryName item={p}/></h3>{p.category.endsWith('/gacha') && <span className="edition-record-date">{dateLabel(p)}</span>}</span></span><span className="edition-record-tags">{mixed ? <span>{categoryName(p.category)}<small>{tags(p).slice(0, 2).join(' · ')}</small></span> : <Labels item={p}/>}</span><span className="edition-record-id">{p.id}</span><span className="edition-record-action"><span>打开档案</span><Arrow/></span></EntryLink>)}</div>;
}

export function InkWorld({data, route, season = false}) {
  const id = season ? 'currency' : route.category?.split('/')[0] || 'zzz';
  const world = WORLDS.find(w => w.id === id) || WORLDS[0], copy = WORLD_COPY[world.id];
  const base = season ? route.category?.split('/').slice(0, 2).join('/') || 'currency/season1' : world.id;
  const groups = data.groups.filter(g => g.id.startsWith(base + '/'));
  const category = season ? `${base}/roles` : world.category;
  const items = data.items.filter(p => p.category === category);
  const first = items[0];
  return <section className="edition-world-page"><div className="edition-breadcrumb"><a href={href(THEME)}>书局首页</a><span>/</span><span>{world.name}{season && ` · 第${base.endsWith('season2') ? '二' : '一'}赛季`}</span></div><header className={`edition-world-heading edition-world-${world.id}`}><div><EditionLabel number={copy.chapter}>{world.en}</EditionLabel><h1>{world.name}<span>资料分卷</span></h1><p>{copy.title}</p><small>{groups.length} 个分类 · {data.items.filter(p => p.category.startsWith(base + '/')).length} 份可读档案</small>{season && <SeasonSwitch theme={THEME} route={route}/>}</div><img src={copy.art} alt={copy.subject}/><span className="edition-world-heading-mark" aria-hidden="true">{['一', '二', '三'][WORLDS.indexOf(world)]}</span></header><div className="edition-world-layout"><div className="edition-world-directory"><EditionLabel>本卷目录</EditionLabel><nav aria-label="资料分类">{groups.map((g, i) => <a key={g.id} href={href(THEME, {view: 'list', category: g.id})}><span className="edition-mono">{String(i + 1).padStart(2, '0')}</span><strong>{categoryName(g.id)}</strong><small>{g.count}</small><Arrow/></a>)}</nav><p className="edition-directory-note">数字为本次可读档案数。完整目录持续收录中。</p></div><div><div className="edition-section-head"><div><EditionLabel>打开一份档案</EditionLabel><h2>{season ? '赛季人物' : '在这里，认识他们。'}</h2></div><a className="edition-text-link" href={href(THEME, {view: 'list', category})}>全部{categoryName(category)} <Arrow/></a></div><InkCollection items={items}/>{first && <div className="edition-world-reading"><span className="edition-trust-seal" aria-hidden="true">知</span><div><h3>{season ? '理解规则，再落下一步。' : '知其然，也知其所以然。'}</h3><p>{season ? '查阅羁绊、物品与投资规则，建立自己的组合思路。' : '从数值与公式出发，理解角色表现背后的机制。'}</p></div><a href={href(THEME, {view: 'list', category: season ? `${base}/strategies` : `${world.id}/formula`})}>{season ? '阅读投资策略' : '阅读机制笔记'} <Arrow/></a></div>}</div></div></section>;
}

function levelCaption(p) {
  if (p.category.startsWith('currency/')) return `赛季属性 · ${p.fields.赛季 || '以来源为准'}`;
  if (p.category === 'hsr/characters') return '基础属性 · Lv.1';
  if (p.category === 'hsr/light_cones') return ['21003', '22009', '23065'].includes(String(p.id)) ? '基础属性 · Lv.80' : '来源基础值 · 等级以正文为准';
  if (p.category === 'hsr/enemies' && p.fields.属性等级) return `属性摘要 · Lv.${p.fields.属性等级} / 难度组 1`;
  return '属性摘要 · 以正文等级口径为准';
}

export function InkDetail({p, route, data}) {
  const sections = prepareSections(p).filter(s => s.group !== '来源').sort((a, b) => SECTION_GROUPS.indexOf(a.group) - SECTION_GROUPS.indexOf(b.group));
  const first = sections.find(s => s.isPrimary) || sections[0];
  const [active, setActive] = useState(first?.id);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const readingRef = useRef(null);
  const current = sections.find(s => s.id === active) || first;
  const groups = [...new Set(sections.map(s => s.group))];
  const groupSections = sections.filter(s => s.group === current?.group);
  const currentIndex = sections.findIndex(s => s.id === current?.id);
  const stats = statFields(p);
  const statsNames = new Set(stats.map(([name]) => name));
  const facts = infoFields(p).filter(([name]) => !statsNames.has(name)).slice(0, 8);
  const select = (section, moveFocus = true) => {
    if (!section) return;
    setActive(section.id);
    setDirectoryOpen(false);
    if (!moveFocus) return;
    requestAnimationFrame(() => {
      readingRef.current?.focus({preventScroll: true});
      if (window.matchMedia('(max-width: 760px)').matches || (readingRef.current?.getBoundingClientRect().top || 0) < 0) {
        readingRef.current?.scrollIntoView({block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      }
    });
  };
  const related = data.items.filter(x => x.category === p.category && x.key !== p.key).slice(0, 3);
  return <article className="edition-detail" data-entry-key={p.key} data-detail-layout="ink"><div className="edition-breadcrumb"><a href={buildReturnHref(THEME, route, p.category)}>← 返回{route.returnTo ? '浏览结果' : `${categoryName(p.category)}图鉴`}</a><span>/</span><span>{GAME_NAMES[p.category.split('/')[0]]}</span><span>/</span><span>{p.name}</span></div><header className="edition-detail-heading"><div className="edition-detail-identity"><EditionLabel>{categoryName(p.category)}档案 <span className="edition-mono">NO. {p.id}</span></EditionLabel><h1><EntryName item={p}/></h1><Labels item={p}/><p>{p.fields.alias && p.fields.alias !== p.name ? p.fields.alias : `${GAME_NAMES[p.category.split('/')[0]]} · ${categoryName(p.category)}资料`}</p>{p.category.endsWith('/gacha') && <p className="edition-event-date">{dateLabel(p)}</p>}<span className="edition-detail-date">收录于 {(p.fields.last_crawled_at || p.fields.captured_at || '').slice(0, 10) || '日期未注明'}</span></div><div className="edition-detail-portrait"><EditionAsset item={p} large/><span>人物与器物 · 各有其章</span></div>{stats.length > 0 && <div className="edition-stat-block"><span>{levelCaption(p)}</span><dl>{stats.map(([k, v]) => <div key={k}><dt>{k.replace(/^基础/, '')}</dt><dd>{typeof v === 'number' ? v.toLocaleString('zh-CN') : v}</dd></div>)}</dl></div>}</header>
    {!!p.issues?.length && <details className="edition-data-note"><summary>阅读前请留意 · {p.issues.length} 条来源说明</summary><ul>{p.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
    {sections.length > 0 ? <><nav className="edition-group-nav" aria-label="档案内容分类">{groups.map(group => <button key={group} className={current?.group === group ? 'active' : ''} aria-pressed={current?.group === group} onClick={() => select(sections.find(s => s.group === group), false)}>{group}<span>{sections.filter(s => s.group === group).length}</span></button>)}<span className="edition-chapter-count">{sections.length} 个章节</span></nav><div className="edition-reader-layout"><div className={`edition-chapter-nav ${directoryOpen ? 'is-open' : ''}`}><button className="edition-directory-toggle" aria-expanded={directoryOpen} aria-controls="edition-chapter-links" onClick={() => setDirectoryOpen(!directoryOpen)}><span>{current?.group} / {current?.shortTitle || current?.title}</span><span>{directoryOpen ? '收起 −' : '目录 ＋'}</span></button><div id="edition-chapter-links"><EditionLabel>{current?.group}篇 / CONTENTS</EditionLabel><nav aria-label={`${current?.group}章节`}>{groupSections.map((s, i) => <button key={s.id} className={s.id === current?.id ? 'active' : ''} aria-current={s.id === current?.id ? 'location' : undefined} onClick={() => select(s)}><span>{String(i + 1).padStart(2, '0')}</span><strong>{s.shortTitle || s.title}</strong><span aria-hidden="true">↗</span></button>)}</nav><div className="edition-margin-note"><span aria-hidden="true">阅</span><p>循着目录，<br/>读到你想知道的。</p></div></div></div><div className="edition-reading-page" ref={readingRef} tabIndex={-1}><div className="edition-running-head"><span>{p.name} / {current?.group}篇</span><span>{String(currentIndex + 1).padStart(2, '0')} — {String(sections.length).padStart(2, '0')}</span></div><ReaderSection key={current.id} section={current} theme={THEME} route={route} index={currentIndex}/><nav className="edition-chapter-pagination" aria-label="章节翻页"><button disabled={currentIndex <= 0} onClick={() => select(sections[currentIndex - 1])}><span>← 上一章</span><strong>{sections[currentIndex - 1]?.shortTitle || '已到卷首'}</strong></button><button disabled={currentIndex >= sections.length - 1} onClick={() => select(sections[currentIndex + 1])}><span>下一章 →</span><strong>{sections[currentIndex + 1]?.shortTitle || '已到卷末'}</strong></button></nav></div></div></> : <div className="edition-reading-page"><h2>档案摘要</h2><p>当前来源尚未收录更多章节，可先查阅下方属性与原始来源。</p></div>}
    <div className="edition-detail-notes">{facts.length > 0 && <details className="edition-source"><summary><span>更多档案属性</span><span aria-hidden="true">＋</span></summary><dl className="edition-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl></details>}<SourceNote p={p}/></div>
    {related.length > 0 && <section className="edition-related"><div className="edition-section-head"><div><EditionLabel>继续翻阅</EditionLabel><h2>同卷，还有这些相遇。</h2></div><a href={buildReturnHref(THEME, route, p.category)}>返回目录 <Arrow/></a></div><div>{related.map(item => <EntryLink item={item} theme={THEME} key={item.key}><EditionAsset item={item} mode="icon"/><span><small>{categoryName(item.category)}</small><strong><EntryName item={item}/></strong><em>{tags(item).slice(0, 2).join(' · ')}</em></span><Arrow/></EntryLink>)}</div></section>}
  </article>;
}
