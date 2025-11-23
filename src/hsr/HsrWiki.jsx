import React, { useState, memo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../DataContext'
import '../ZZZWiki.css'
import star from '../assets/star.jpg'

const HsrWiki = () => {
  const { data, baseData, loading, error } = useData()
  const [activeTab, setActiveTab] = useState('hsrCharacters')
  const [filters, setFilters] = useState({ hsrCharacters:{ element:[], path:[], rarity:[] }, hsrCones:{ path:[], rarity:[] }, hsrRelics:{ type:[], part:[] } })

  const handleFilterChange = (tab, type, values) => setFilters(prev => ({ ...prev, [tab]: { ...prev[tab], [type]: values } }))
  const arr = (v)=> Array.isArray(v)?v:[]
  const hsr = baseData?.hsr || { elements:[], paths:[], rarities:[], relicTypes:[], relicParts:[] }

  const applyFilters = (items, tab) => {
    const f = filters[tab] || {}
    if (tab==='hsrCharacters') return items.filter(i=>
      (!f.element.length || f.element.includes(i.element || i.HsrElement?.name)) &&
      (!f.path.length || f.path.includes(i.path || i.HsrPath?.name)) &&
      (!f.rarity.length || f.rarity.includes(i.rarity || i.HsrRarity?.name))
    )
    if (tab==='hsrCones') return items.filter(i=>
      (!f.path.length || f.path.includes(i.path || i.HsrPath?.name)) &&
      (!f.rarity.length || f.rarity.includes(i.rarity || i.HsrRarity?.name))
    )
    if (tab==='hsrRelics') return items.filter(i=>
      (!f.type.length || f.type.includes(i.type || i.HsrRelicType?.name)) &&
      (!f.part.length || f.part.includes(i.part))
    )
    return items
  }

  const renderFilters = () => {
    const f = filters[activeTab]
    const toggle = (list, val)=> (list.includes(val) ? list.filter(v=>v!==val) : [...list,val])
    if (activeTab==='hsrCharacters') return (
      <div className="agents-filter-horizontal">
        <div className="filter-group"><h3>元素</h3><div className="filter-options">
          <button className={!f.element.length?'active':''} onClick={()=>handleFilterChange('hsrCharacters','element',[])}>全部</button>
          {arr(hsr.elements).map(e=> (
            <button key={e.id||e.name} className={(f.element&&f.element.includes(e.name))?'active':''} onClick={()=>handleFilterChange('hsrCharacters','element',toggle(f.element,e.name))}>{e.name}</button>
          ))}
        </div></div>
        <div className="filter-group"><h3>命途</h3><div className="filter-options">
          <button className={!f.path.length?'active':''} onClick={()=>handleFilterChange('hsrCharacters','path',[])}>全部</button>
          {arr(hsr.paths).map(p=> (
            <button key={p.id||p.name} className={(f.path&&f.path.includes(p.name))?'active':''} onClick={()=>handleFilterChange('hsrCharacters','path',toggle(f.path,p.name))}>{p.name}</button>
          ))}
        </div></div>
        <div className="filter-group"><h3>稀有度</h3><div className="filter-options">
          <button className={!f.rarity.length?'active':''} onClick={()=>handleFilterChange('hsrCharacters','rarity',[])}>全部</button>
          {arr(hsr.rarities).map(r=> (
            <button key={r.id||r.name} className={(f.rarity&&f.rarity.includes(r.name))?'active':''} onClick={()=>handleFilterChange('hsrCharacters','rarity',toggle(f.rarity,r.name))}>{r.name}</button>
          ))}
        </div></div>
      </div>
    )
    if (activeTab==='hsrCones') return (
      <div className="soundengines-filter-horizontal">
        <div className="filter-group"><h3>命途</h3><div className="filter-options">
          <button className={!f.path.length?'active':''} onClick={()=>handleFilterChange('hsrCones','path',[])}>全部</button>
          {arr(hsr.paths).map(p=> (
            <button key={p.id||p.name} className={(f.path&&f.path.includes(p.name))?'active':''} onClick={()=>handleFilterChange('hsrCones','path',toggle(f.path,p.name))}>{p.name}</button>
          ))}
        </div></div>
        <div className="filter-group"><h3>稀有度</h3><div className="filter-options">
          <button className={!f.rarity.length?'active':''} onClick={()=>handleFilterChange('hsrCones','rarity',[])}>全部</button>
          {arr(hsr.rarities).map(r=> (
            <button key={r.id||r.name} className={(f.rarity&&f.rarity.includes(r.name))?'active':''} onClick={()=>handleFilterChange('hsrCones','rarity',toggle(f.rarity,r.name))}>{r.name}</button>
          ))}
        </div></div>
      </div>
    )
    if (activeTab==='hsrRelics') return (
      <div className="bumbos-filter-horizontal">
        <div className="filter-group"><h3>类型</h3><div className="filter-options">
          <button className={!f.type.length?'active':''} onClick={()=>handleFilterChange('hsrRelics','type',[])}>全部</button>
          {arr(hsr.relicTypes).map(t=> (
            <button key={t.id||t.name} className={(f.type&&f.type.includes(t.name))?'active':''} onClick={()=>handleFilterChange('hsrRelics','type',toggle(f.type,t.name))}>{t.name}</button>
          ))}
        </div></div>
        <div className="filter-group"><h3>部位</h3><div className="filter-options">
          <button className={!f.part.length?'active':''} onClick={()=>handleFilterChange('hsrRelics','part',[])}>全部</button>
          {arr(hsr.relicParts).map(p=> (
            <button key={p} className={(f.part&&f.part.includes(p))?'active':''} onClick={()=>handleFilterChange('hsrRelics','part',toggle(f.part,p))}>{p}</button>
          ))}
        </div></div>
      </div>
    )
    return null
  }

  const renderList = () => {
    if (activeTab==='hsrCharacters') {
      const items = applyFilters(arr(data.hsrCharacters), 'hsrCharacters')
      return (
        <div className="content-grid">
          {items.map(it=> (
            <div key={it.id} className="card">
              <img src={it.image || star} alt={it.name} className="card-image" onError={(e)=>{e.target.src=star}} />
              <h3>{it.name}</h3>
              <div className="card-footer">
                <span className="role-tag">{it.element || it.HsrElement?.name}</span>
                <span className="role-tag">{it.path || it.HsrPath?.name}</span>
                <span className="rarity-badge">{it.rarity || it.HsrRarity?.name}</span>
              </div>
            </div>
          ))}
        </div>
      )
    }
    if (activeTab==='hsrCones') {
      const items = applyFilters(arr(data.hsrCones), 'hsrCones')
      return (
        <div className="content-grid">
          {items.map(it=> (
            <div key={it.id} className="card">
              <img src={it.image || star} alt={it.name} className="card-image" onError={(e)=>{e.target.src=star}} />
              <h3>{it.name}</h3>
              <div className="card-footer">
                <span className="role-tag">{it.path || it.HsrPath?.name}</span>
                <span className="rarity-badge">{it.rarity || it.HsrRarity?.name}</span>
              </div>
            </div>
          ))}
        </div>
      )
    }
    const items = applyFilters(arr(data.hsrRelics), 'hsrRelics')
    return (
      <div className="content-grid">
        {items.map(it=> (
          <div key={it.id} className="card">
            <img src={it.image || star} alt={it.name} className="card-image" onError={(e)=>{e.target.src=star}} />
            <h3>{it.name}</h3>
            <div className="card-footer">
              <span className="role-tag">{it.type || it.HsrRelicType?.name}</span>
              <span className="role-tag">{it.setName}</span>
              <span className="role-tag">{it.part}</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="wiki-container">
      <div className="sidebar open fixed-sidebar">
        <div className="sidebar-header">
          <Link to="/" className="home-link"><h2 className="wiki-title">HengHSR</h2></Link>
        </div>
        <nav className="sidebar-nav">
          <ul>
            <li className={activeTab==='hsrCharacters'?'active':''} onClick={()=>setActiveTab('hsrCharacters')}>角色</li>
            <li className={activeTab==='hsrCones'?'active':''} onClick={()=>setActiveTab('hsrCones')}>光锥</li>
            <li className={activeTab==='hsrRelics'?'active':''} onClick={()=>setActiveTab('hsrRelics')}>遗器</li>
          </ul>
        </nav>
      </div>
      <div className="main-content">
        {loading ? (<div className="loading-container"><p>加载中...</p></div>) : (error ? (<div className="error-container"><p>加载失败: {error}</p></div>) : (
          <div className="content-section">
            <h2 className="section-title">崩坏：星穹铁道</h2>
            {renderFilters()}
            {renderList()}
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(HsrWiki)