import {useState} from 'react';
import {THEMES} from './themes.js';
import {href} from './model.js';
import {AtlasMark} from './AtlasEdition.jsx';

const VIEWS = {
  home: {label: '主页', route: {}},
  list: {label: '列表', route: {view: 'list', category: 'zzz/agents'}},
  detail: {label: '详情', route: {view: 'list', category: 'hsr/characters', entry: 'hsr/characters/1415'}},
};

export default function DesignGallery() {
  const [view, setView] = useState('home');
  return <main className="design-gallery">
    <header className="gallery-head"><a href="#/" className="gallery-logo">HENG<span>BERGER®</span></a><span>DESIGN EXPLORATIONS<br/>REVISED EDITION — 2026</span><a href="#finalists" onClick={e=>{e.preventDefault();document.getElementById("finalists")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}}>比较两套精修版 ↓</a></header>
    <section className="gallery-intro"><div><span className="eyebrow">TWO EDITIONS. ONE CURIOSITY.</span><h1>两种气质，<br/><em>同一份热爱。</em></h1></div><div className="gallery-note"><span className="gallery-star">✳</span><p>开放图录与万象书局，完整精修的两种选择。<br/>从首页到内页比较，找到适合你的阅读方式。</p><span>ZZZ / HSR / 货币战争</span></div></section>
    <section className="gallery-finalists" id="finalists" aria-label="两套精修方案">
      {[{id:'orbital',code:'B',name:'开放图录',en:'THE OPEN INDEX',line:'清晰、开放，面向探索。',desc:'钴蓝索引 · 视觉图鉴 · 紧凑资料阅读',mark:'＋'},{id:'ink',code:'H',name:'万象书局',en:'THE LIVING ARCHIVE',line:'温润、从容，适合深读。',desc:'中文衬线 · 书册目录 · 分章沉浸阅读',mark:'万'}].map(t=><article className={'gallery-finalist finalist-'+t.id} key={t.id}><div className="finalist-top"><span>精修方案 / EDITION {t.code}</span><span>{t.en}</span></div><div className="finalist-identity"><span className="finalist-mark" aria-hidden="true">{t.id==='orbital'?<AtlasMark/>:t.mark}</span><div><h2>{t.name}</h2><p>{t.line}</p></div></div><p className="finalist-description">{t.desc}</p><nav aria-label={t.name+'精修版入口'}><a href={href(t.id)}>进入首页 ↗</a><a href={href(t.id,{view:'list',category:'hsr/characters'})}>角色图鉴 ↗</a><a href={href(t.id,VIEWS.detail.route)}>同一角色详情 ↗</a></nav></article>)}
    </section>
    <div className="gallery-view-switch" role="group" aria-label="预览页面类型">{Object.entries(VIEWS).map(([id, v]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{v.label}预览</button>)}<span>点击图片进入对应页面 ↗</span></div>
    <div className="gallery-grid">{THEMES.map((t, i) => <section className="gallery-project" key={t.id}><a className="theme-preview" href={href(t.id, VIEWS[view].route)}><div className="gallery-shot" style={{background: t.bg}}><img key={view} src={`/demo-art/previews/${t.id}${view === 'home' ? '' : '-' + view}.png${['ink','orbital'].includes(t.id) ? '?edition=3' : ''}`} alt={`${t.name}${VIEWS[view].label}预览`} loading={i < 2 ? 'eager' : 'lazy'}/><span className="gallery-open">进入{VIEWS[view].label} ↗</span></div><div className="preview-caption"><span className="preview-number">0{i + 1}</span><div><h2>{t.name} <small>{t.en}</small></h2><p>{t.desc}</p></div><span>↗</span></div></a><nav className="gallery-subpages" aria-label={`${t.name}页面入口`}>{Object.values(VIEWS).map(v => <a key={v.label} href={href(t.id, v.route)}>{v.label} ↗</a>)}<a href={href(t.id, {view: 'season', category: 'currency/season1/roles'})}>货币战争 ↗</a></nav></section>)}</div>
    <footer className="gallery-footer"><span>每套 16 类代表页面 · 87 条真实样本</span><p>从首页、图鉴到赛季分卷。详情支持等级调节、来源说明与分章阅读。</p><span>H/B — REVIEW REVISION</span></footer>
  </main>;
}