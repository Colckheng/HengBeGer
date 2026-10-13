import {useId, useRef, useState} from 'react';
import {EntryLink, Labels} from './Visuals.jsx';
import ReaderSection from './ReaderLoader.jsx';
import {categoryName, dateLabel, infoFields, statFields, tags} from './model.js';
import {prepareSections, SECTION_GROUPS} from './contentModel.js';
import {buildReturnHref} from './navigation.js';
import {GAME_NAMES} from './themes.js';
import artworks from './artworks.json';

const THEME = 'orbital';
const PURPOSE = {
  agents: '能力、影画与养成资料', characters: '技能、星魂与成长资料',
  bangboo: '技能与突破资料', sound_engines: '基础属性与精炼效果',
  light_cones: '基础属性与叠影效果', drive_disks: '套装效果与部件资料',
  relics: '套装效果与部件资料', enemies: '弱点、抗性与招式资料',
  roles: '星阶、站位与羁绊资料', traits: '激活条件与成员资料',
  items: '物品效果与适用条件', strategies: '投资效果与策略规则',
  environments: '投资环境与规则变化', gacha: '活动日期与跃迁记录',
  formula: '公式、定义与计算口径',
};

function Arrow({back = false}) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={back ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function Name({item}) {
  const variant = item.category === 'hsr/characters' && ['三月七', '开拓者'].includes(item.name)
    ? item.fields.命途
    : item.category.endsWith('/roles') && item.fields.星阶 ? `${item.fields.星阶} 阶` : '';
  return <>{item.name}{variant && <span className="atlasx-variant">{variant}</span>}</>;
}

function Portrait({item, icon = false}) {
  const [failed, setFailed] = useState(false);
  const art = artworks[item.key];
  const src = !icon && art?.usage !== 'emblem' && art?.src || item.image;
  const kind = item.category.split('/').at(-1);
  const symbol = kind === 'formula' ? '∑' : kind === 'gacha' ? '↗' : Array.from(item.name)[0];
  return <div className={`atlasx-portrait ${src && !failed ? 'has-image' : 'is-symbol'}`}>
    {src && !failed ? <img src={src} alt={item.name} loading={icon ? 'lazy' : 'eager'} onError={() => setFailed(true)}/> : <><span aria-hidden="true">{symbol}</span><small>{kind === 'formula' ? 'FIELD NOTE' : kind === 'gacha' ? 'EVENT LOG' : 'ARCHIVE'}</small></>}
  </div>;
}

function levelCaption(p) {
  if (p.category.startsWith('currency/')) return `赛季属性 · ${p.fields.赛季 || '等级见正文'}`;
  if (p.category === 'hsr/characters') return '基础属性 · Lv.1';
  if (p.category === 'hsr/light_cones') return ['21003', '22009', '23065'].includes(String(p.id)) ? '基础属性 · Lv.80' : '来源基础值 · 等级见正文';
  if (p.category === 'hsr/enemies' && p.fields.属性等级) return `属性摘要 · Lv.${p.fields.属性等级} / 难度组 1`;
  return '属性摘要 · 等级见正文';
}

function Provenance({p, sourceRef, sourceId}) {
  const fields = p.fields;
  const date = (fields.last_crawled_at || fields.captured_at || '').slice(0, 10);
  const notes = prepareSections(p).filter(section => section.group === '来源');
  return <details className="atlasx-disclosure" ref={sourceRef} id={sourceId}>
    <summary><span><span className="atlasx-micro">PROVENANCE</span>来源与核验记录</span><span className="atlasx-disclosure-mark" aria-hidden="true">＋</span></summary>
    <div className="atlasx-disclosure-body">
      <dl className="atlasx-source-meta"><div><dt>原始来源</dt><dd>{fields.source || '未注明'}{fields.source_url && <a href={fields.source_url} target="_blank" rel="noreferrer">查阅来源 ↗</a>}</dd></div><div><dt>收录日期</dt><dd>{date || '未注明'}</dd></div>{fields.author && <div><dt>作者</dt><dd>{fields.author}</dd></div>}{fields.license && <div><dt>内容许可</dt><dd>{fields.license}</dd></div>}</dl>
      <p>资料保留来源数值与等级口径。收录日期不代表游戏版本；不同形态、等级与来源的数值，请结合正文说明阅读。</p>
      {p.key === 'hsr/light_cones/20000' && <p className="atlasx-source-difference"><strong>来源数值存在差异。</strong>摘要字段的生命 / 攻击 / 防御为 846 / 317 / 264，正文 Lv.80 表为 847 / 318 / 265。两组原始值均予保留，差异原因尚未确认。</p>}
      {p.sourceCheck?.scope && <p>{p.sourceCheck.scope}</p>}
      {notes.map(section => <details className="atlasx-verification" key={section.id}><summary>{section.title}</summary><pre>{section.body}</pre></details>)}
    </div>
  </details>;
}

function AtlasRecord({p, route, data}) {
  const sections = prepareSections(p).filter(section => section.group !== '来源').sort((a, b) => SECTION_GROUPS.indexOf(a.group) - SECTION_GROUPS.indexOf(b.group));
  const first = sections.find(section => section.isPrimary) || sections[0];
  const [active, setActive] = useState(first?.id);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const readingRef = useRef(null), sourceRef = useRef(null), remembered = useRef({});
  const id = useId(), directoryId = `${id}-chapters`, readingId = `${id}-reading`, sourceId = `${id}-source`;
  const current = sections.find(section => section.id === active) || first;
  const groups = SECTION_GROUPS.filter(group => sections.some(section => section.group === group));
  const chapters = sections.filter(section => section.group === current?.group);
  const currentIndex = sections.findIndex(section => section.id === current?.id);
  const stats = statFields(p), statsNames = new Set(stats.map(([name]) => name));
  const facts = infoFields(p).filter(([name]) => !statsNames.has(name));
  const kind = p.category.split('/').at(-1), date = (p.fields.last_crawled_at || p.fields.captured_at || '').slice(0, 10);
  const related = data.items.filter(item => item.category === p.category && item.key !== p.key).slice(0, 3);
  const returnHref = buildReturnHref(THEME, route, p.category);
  const select = (section, moveFocus = true) => {
    if (!section) return;
    remembered.current[section.group] = section.id;
    setActive(section.id);
    setDirectoryOpen(false);
    if (!moveFocus) return;
    requestAnimationFrame(() => {
      const reading = readingRef.current;
      reading?.focus({preventScroll: true});
      if (window.matchMedia('(max-width: 760px)').matches || (reading?.getBoundingClientRect().top || 0) < 0) {
        reading?.scrollIntoView({block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      }
    });
  };
  const showSource = () => {
    if (!sourceRef.current) return;
    sourceRef.current.open = true;
    sourceRef.current.querySelector('summary')?.focus();
    sourceRef.current.scrollIntoView({block: 'start', behavior: 'instant'});
  };

  return <article className="atlasx-detail" data-entry-key={p.key} data-detail-layout={THEME}>
    <nav className="atlasx-breadcrumb" aria-label="当前位置"><a href={returnHref}><Arrow back/><span>返回{route.returnTo ? '浏览结果' : `${categoryName(p.category)}图录`}</span></a><span>{GAME_NAMES[p.category.split('/')[0]]}<i aria-hidden="true">/</i>{categoryName(p.category)}</span></nav>
    <header className={`atlasx-profile ${stats.length ? 'has-stats' : ''}`}>
      <div className="atlasx-identity"><div className="atlasx-profile-index"><span>{categoryName(p.category)}档案</span><span className="atlasx-mono">NO. {p.id}</span></div><h1><Name item={p}/></h1><Labels item={p}/><p className="atlasx-description">{p.fields.alias && p.fields.alias !== p.name ? p.fields.alias : PURPOSE[kind] || '资料档案'}</p>{kind === 'gacha' && <p className="atlasx-event-date">{dateLabel(p)}</p>}</div>
      {stats.length > 0 && <div className="atlasx-stats"><p>{levelCaption(p)}</p><dl>{stats.map(([name, value]) => <div key={name}><dt>{name.replace(/^基础/, '')}</dt><dd>{typeof value === 'number' ? value.toLocaleString('zh-CN') : value}</dd></div>)}</dl></div>}
      <div className="atlasx-profile-art"><Portrait item={p}/><span className="atlasx-art-index">{String(p.id)}</span></div>
    </header>
    <div className="atlasx-profile-foot"><span><i aria-hidden="true"/>收录于 {date || '日期未注明'}</span><button className={p.key === 'hsr/light_cones/20000' ? 'atlasx-stat-note' : undefined} aria-label={p.key === 'hsr/light_cones/20000' ? '含来源数值差异 · 查看说明 ↗' : undefined} onClick={showSource}>{p.key === 'hsr/light_cones/20000' ? '来源数值差异 · 查看说明' : '来源与核验记录'} <span aria-hidden="true">↗</span></button></div>
    {!!p.issues?.length && <details className="atlasx-data-note"><summary>来源说明<span>{p.issues.length} 项</span><span aria-hidden="true">＋</span></summary><ul>{p.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
    {sections.length > 0 ? <>
      <nav className="atlasx-groups" aria-label="档案内容分类">{groups.map(group => <button key={group} className={current?.group === group ? 'active' : ''} aria-pressed={current?.group === group} aria-controls={readingId} onClick={() => select(sections.find(section => section.id === remembered.current[group]) || sections.find(section => section.group === group), false)}>{group}<span>{sections.filter(section => section.group === group).length}</span></button>)}<span className="atlasx-total">{sections.length} 个章节</span></nav>
      <div className="atlasx-reading-layout">
        <div className={`atlasx-directory ${directoryOpen ? 'is-open' : ''}`}><button className="atlasx-directory-toggle" aria-expanded={directoryOpen} aria-controls={directoryId} onClick={() => setDirectoryOpen(!directoryOpen)}><span>{current?.group}<i aria-hidden="true">/</i>{current?.shortTitle || current?.title}</span><span>{directoryOpen ? '收起 −' : '目录 ＋'}</span></button><div className="atlasx-chapter-list" id={directoryId}><div className="atlasx-directory-label"><span>章节索引</span><span className="atlasx-mono">INDEX</span></div><nav aria-label={`${current?.group}章节`}>{chapters.map((section, index) => <button key={section.id} className={section.id === current?.id ? 'active' : ''} aria-current={section.id === current?.id ? 'location' : undefined} onClick={() => select(section)}><span className="atlasx-mono">{String(index + 1).padStart(2, '0')}</span><strong>{section.shortTitle || section.title}</strong><span aria-hidden="true">↗</span></button>)}</nav><div className="atlasx-directory-foot"><span>{current?.group}</span><span>{chapters.length} 个章节</span></div></div></div>
        <div className="atlasx-reading-page" id={readingId} ref={readingRef} tabIndex={-1} role="region" aria-label={`${current?.shortTitle || current?.title}正文`}><div className="atlasx-running-head"><span>{p.name}<i aria-hidden="true">/</i>{current?.group}</span><span className="atlasx-mono">{String(currentIndex + 1).padStart(2, '0')} — {String(sections.length).padStart(2, '0')}</span></div><ReaderSection key={current.id} section={current} theme={THEME} route={route} index={currentIndex}/><nav className="atlasx-chapter-pagination" aria-label="章节翻页"><button disabled={currentIndex <= 0} onClick={() => select(sections[currentIndex - 1])}><span><Arrow back/>上一章</span><strong>{sections[currentIndex - 1]?.shortTitle || '已到首章'}</strong></button><button disabled={currentIndex >= sections.length - 1} onClick={() => select(sections[currentIndex + 1])}><span>下一章<Arrow/></span><strong>{sections[currentIndex + 1]?.shortTitle || '已到末章'}</strong></button></nav></div>
      </div>
    </> : <section className="atlasx-empty"><span className="atlasx-micro">RECORD OVERVIEW</span><h2>档案摘要</h2><p>当前来源尚未收录更多章节，可查阅下方属性与原始来源。</p></section>}
    <div className="atlasx-supplement">{facts.length > 0 && <details className="atlasx-disclosure"><summary><span><span className="atlasx-micro">PROFILE DATA</span>更多档案属性</span><span className="atlasx-disclosure-mark" aria-hidden="true">＋</span></summary><div className="atlasx-disclosure-body"><dl className="atlasx-facts">{facts.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>)}</dl></div></details>}<Provenance p={p} sourceRef={sourceRef} sourceId={sourceId}/></div>
    {related.length > 0 && <section className="atlasx-related"><header><div><span className="atlasx-micro">CONTINUE EXPLORING</span><h2>相关档案</h2></div><a href={returnHref}>返回图录 <Arrow/></a></header><div className="atlasx-related-grid">{related.map(item => <EntryLink key={item.key} item={item} theme={THEME} className="atlasx-related-card"><Portrait item={item} icon/><span className="atlasx-related-info"><small>{categoryName(item.category)}<span className="atlasx-mono">{item.id}</span></small><strong><Name item={item}/></strong><em>{tags(item).slice(0, 2).join(' · ') || '查阅详细资料'}</em></span><Arrow/></EntryLink>)}</div></section>}
  </article>;
}

// Key the stateful reading session to the record, including related-record navigation.
export default function AtlasDetail(props) {
  return <AtlasRecord key={props.p.key} {...props}/>;
}
