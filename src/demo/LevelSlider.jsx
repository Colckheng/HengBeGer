import {useId,useRef,useState} from 'react';

export default function LevelSlider({values,value,onChange,label='技能等级',theme}){
  const id=useId(),gesture=useRef(null),[draft,setDraft]=useState(null),[error,setError]=useState('');
  const index=Math.max(0,values.indexOf(String(value))),tuner=['radio','terminal'].includes(theme);
  const change=i=>{onChange(values[Math.max(0,Math.min(values.length-1,i))]);setDraft(null);setError('');};
  const commit=()=>{const n=String(Number(draft??value));if(!/^\d+$/.test(String(draft??value))||!values.includes(n)){setError('请输入刻度范围内已收录的等级');return;}onChange(n);setDraft(null);setError('');};
  return <div className={`level-control ${tuner?'level-tuner':''}`} style={{'--level-progress':`${index/(values.length-1)*100}%`,'--level-index':index}}>
    <div className="level-control-head"><label htmlFor={id}>{label}</label><label className="level-readout"><span>Lv.</span><input aria-label={`${label}精确输入`} inputMode="numeric" value={draft??value} aria-invalid={!!error} aria-describedby={error?id+'-error':undefined} onFocus={e=>e.target.select()} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){setDraft(null);setError('');}}}/></label></div>
    <div className="level-track">
      <input id={id} type="range" aria-label={label} min="0" max={values.length-1} step="1" value={index} aria-valuetext={`等级 ${value}，已收录 ${values[0]} 至 ${values.at(-1)}`} onChange={e=>change(Number(e.target.value))}
        onPointerDown={e=>{if(!tuner||e.button!==0)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);gesture.current={x:e.clientX,index,id:e.pointerId,moved:false};}}
        onPointerMove={e=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;const dx=e.clientX-g.x;if(Math.abs(dx)>6)g.moved=true;if(g.moved)change(g.index-Math.round(dx/32));}}
        onPointerUp={e=>{const g=gesture.current;if(!g)return;if(!g.moved){const b=e.currentTarget.getBoundingClientRect();change(g.index+Math.round((e.clientX-b.left-b.width/2)/32));}gesture.current=null;}}
        onPointerCancel={()=>gesture.current=null}/>
      {tuner?<><div className="level-ruler" aria-hidden="true"><div>{values.map((v,i)=><span key={v} style={{left:i*32}} className={i===index?'selected':''}>{v}</span>)}</div></div><i className="level-needle" aria-hidden="true"/></>:<div className="level-rail" aria-hidden="true"><div className="level-fill"/><i className="level-thumb"/>{values.map((v,i)=><span className="level-tick" key={v} style={{left:`${i/(values.length-1)*100}%`}}>{i===0||i===values.length-1||i===index?v:''}</span>)}</div>}
    </div><p className="level-help">{tuner?'拨动标尺':'拖动调级'} · 数字可直接输入 · 范围 {values[0]}–{values.at(-1)}</p>{error&&<p className="level-error" id={id+'-error'} role="alert">{error}</p>}
  </div>;
}
