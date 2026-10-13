import {useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {href,sectionModes,bodyAtLevel,nearestLevel} from './model.js';
import LevelSlider from './LevelSlider.jsx';
import {prepareReaderContent,skillShortTitle} from './contentModel.js';

function ArticleImage({src,alt}){
  const [failed,setFailed]=useState(false);
  if(!/^https?:\/\//.test(src||''))return <span>{alt||'原文插图'}</span>;
  return failed?<a href={src} target="_blank" rel="noreferrer">原文插图暂不可用 · 查看来源图片 ↗</a>:<img className="article-image" src={src} alt={alt||'原文插图'} loading="lazy" onError={()=>setFailed(true)}/>;
}
function ScrollableTable({children}){
  const scrollRef=useRef(null),tableRef=useRef(null);
  const [overflow,setOverflow]=useState(false);
  useEffect(()=>{
    let active=true;
    const measure=()=>{
      const viewport=scrollRef.current;
      if(active&&viewport)setOverflow(viewport.scrollWidth>viewport.clientWidth+1);
    };
    measure();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
    if(scrollRef.current)observer?.observe(scrollRef.current);
    if(tableRef.current)observer?.observe(tableRef.current);
    window.addEventListener('resize',measure);
    const fonts=document.fonts;
    fonts?.addEventListener?.('loadingdone',measure);
    fonts?.ready?.then(measure).catch(()=>{});
    return ()=>{
      active=false;
      observer?.disconnect();
      window.removeEventListener('resize',measure);
      fonts?.removeEventListener?.('loadingdone',measure);
    };
  },[children]);
  return <div className="table-frame">{overflow&&<p className="table-hint">宽表可左右滑动 <span aria-hidden="true">↔</span></p>}<div ref={scrollRef} className="table-scroll" tabIndex={overflow?0:undefined} role={overflow?'region':undefined} aria-label={overflow?'数据表，可横向滚动':undefined}><table ref={tableRef}>{children}</table></div></div>;
}
export function RichText({body,theme,route}){
  return <div className="rich-text"><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]} urlTransform={url=>/^(https?:|entry:|#)/.test(url)?url:''} components={{
    a:({href:url,children})=>url?.startsWith('entry:')?<a href={href(theme,{...route,entry:url.slice(6)})}>{children} ↗</a>:url?<a href={url} target="_blank" rel="noreferrer">{children}</a>:<span>{children}</span>,
    h3:({children})=>children?<h3>{children}</h3>:null,
    img:({src,alt})=><ArticleImage src={src} alt={alt}/>,
    table:ScrollableTable,
  }}>{body}</ReactMarkdown></div>;
}
function RankedText({body,theme,route}){
  const ranks=[...body.matchAll(/^### (叠影\s*\d+|[1-5] · .+)\s*$/gm)];
  const [rank,setRank]=useState('0');
  if(ranks.length<2)return <RichText body={body} theme={theme} route={route}/>;
  const n=Number(rank),start=ranks[n].index,end=ranks[n+1]?.index||body.length;
  return <><LevelSlider values={ranks.map((_,i)=>String(i+1))} value={String(n+1)} onChange={v=>setRank(String(Number(v)-1))} label="效果档位" theme={theme}/><RichText body={body.slice(0,ranks[0].index)+body.slice(start,end)} theme={theme} route={route}/></>;
}
function SkillGroups({body,theme,route}){
  const marks=[...body.matchAll(/^### (.+)$/gm)];
  const names=marks.map(mark=>mark[1].replace(/\[([^\]]+)\]\([^)]+\)/g,'$1'));
  const [index,setIndex]=useState(0),[level,setLevel]=useState('1');
  const n=Math.min(index,marks.length-1);
  const text=marks.length>1?body.slice(marks[n].index,marks[n+1]?.index||body.length):body;
  const modes=sectionModes(text),chosen=modes?nearestLevel(modes.values,level):undefined;
  const tab=(m,i)=>{
    const name=names[i],duplicate=names.filter(other=>other===name).length>1;
    const source=body.slice(m.index,marks[i+1]?.index||body.length);
    const unlock=duplicate?/^\*\*(角色(?:等级|晋阶)\s*\d+)\*\*\s*$/m.exec(source)?.[1]:null;
    const label=unlock?`${name} · ${unlock}`:name;
    return <button key={i} aria-label={label} title={label} aria-pressed={i===n} onClick={()=>setIndex(i)}>{skillShortTitle(name)}{unlock&&<small> · {unlock}</small>}</button>;
  };
  return <div className={`skill-layout ${marks.length>8?'many-skills':''}`}>{marks.length>1&&<div className="skill-navigation"><div className="skill-tabs" role="group" aria-label="技能分组">{marks.slice(0,marks.length>8?5:marks.length).map(tab)}</div>{marks.length>8&&<details className="skill-more"><summary>更多能力 · {marks.length-5} 项{n>=5?' · 当前：'+marks[n][1]:''}</summary><div className="skill-tabs" role="group" aria-label="附加技能分组">{marks.slice(5).map((m,i)=>tab(m,i+5))}</div></details>}</div>}
    <div className="skill-reading">{modes&&<LevelSlider values={modes.values} value={chosen} onChange={setLevel} label="技能等级" theme={theme}/>}
    <RichText body={(marks.length>1?body.slice(0,marks[0].index):'')+(chosen?bodyAtLevel(text,chosen):text)} theme={theme} route={route}/></div></div>;
}
export default function ReaderSection({section,theme,route,index}){
  const [level,setLevel]=useState('1');
  const body=prepareReaderContent(section.body,route?.entry);
  const mode=sectionModes(body),chosen=mode?.values.includes(level)?level:mode?.values[0];
  const skill=/技能|行迹|影画|星魂|核心被动/.test(section.title);
  return <section id={section.id} className="reader-section"><div className="section-heading"><span className="mono">{String(index+1).padStart(2,'0')}</span><h2>{section.title}</h2></div>
    {section.notes?.map(note=><p className="reader-note" key={note}>{note}</p>)}
    {skill?<SkillGroups body={body} theme={theme} route={route}/>:mode?<><LevelSlider values={mode.values} value={chosen} onChange={setLevel} label={section.title.includes('精炼')?'精炼档位':'数据等级'} theme={theme}/><RichText body={bodyAtLevel(body,chosen)} theme={theme} route={route}/></>:<RankedText body={body} theme={theme} route={route}/>}
  </section>;
}
