import React, { useEffect, useState, memo } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import star from '../assets/star.jpg'
import { useData } from '../DataContext'
const API_BASE_URL = import.meta?.env?.DEV ? '/api' : '/api'

const HsrAdminPanel = () => {
  const { handleUpdateData } = useData()
  const [activeTab, setActiveTab] = useState('hsrCharacters')
  const [activeSubTab, setActiveSubTab] = useState('add')
  const [form, setForm] = useState({})
  const [editingItem, setEditingItem] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editModalData, setEditModalData] = useState({})
  const [modalImagePreview, setModalImagePreview] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [dualStatus, setDualStatus] = useState({})
  const [base, setBase] = useState({ elements:[], paths:[], rarities:[], relicTypes:[], relicParts:[] })
  const [sessionInitialized, setSessionInitialized] = useState(false)
  const [hasAdminChanges, setHasAdminChanges] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [data, setData] = useState({ hsrCharacters:[], hsrCones:[], hsrRelics:[] })
  

  const loadBase = async ()=>{ const r = await axios.get(`${API_BASE_URL}/hsr/base-data`); setBase(r.data) }
  const loadWeb = async ()=>{
    const r = await axios.get(`${API_BASE_URL}/dual-storage/web/data`)
    setData({
      hsrCharacters: Array.isArray(r.data?.data?.hsrCharacters)?r.data.data.hsrCharacters:[],
      hsrCones: Array.isArray(r.data?.data?.hsrCones)?r.data.data.hsrCones:[],
      hsrRelics: Array.isArray(r.data?.data?.hsrRelics)?r.data.data.hsrRelics:[],
    })
  }
  const initDual = async ()=>{
    await axios.post(`${API_BASE_URL}/dual-storage/initialize`)
    await axios.post(`${API_BASE_URL}/dual-storage/admin/session`)
    setSessionInitialized(true)
  }
  useEffect(()=>{ (async()=>{ await loadBase(); await initDual(); await loadWeb() })() }, [])

  const onChange = (e)=>{ setForm(prev=>({ ...prev, [e.target.name]: e.target.value })); setHasAdminChanges(true) }
  const onFile = (e)=>{ const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onloadend=()=> { setForm(prev=>({ ...prev, image:r.result })); setImagePreview(r.result) }; r.readAsDataURL(f) }

  const saveAdminData = async (type, arr)=>{ await axios.put(`${API_BASE_URL}/dual-storage/admin/${type}`, { data: arr }); setHasAdminChanges(true) }
  const syncAdminToWeb = async ()=>{ const resp = await axios.post(`${API_BASE_URL}/dual-storage/sync`); if (resp.data?.success) { await handleUpdateData(); await loadWeb() } }
  const loadDualStorageStatus = async ()=>{ try{ const r = await axios.get(`${API_BASE_URL}/dual-storage/status`); if (r.data?.success) setDualStatus(r.data.status||{}) } catch{} }

  const addItem = async ()=>{
    if (activeTab==='hsrCharacters') await axios.post(`${API_BASE_URL}/hsr/characters`, form)
    else if (activeTab==='hsrCones') await axios.post(`${API_BASE_URL}/hsr/cones`, form)
    else await axios.post(`${API_BASE_URL}/hsr/relics`, form)
    const web = await axios.get(`${API_BASE_URL}/dual-storage/web/data`)
    const arr = Array.isArray(web.data?.data?.[activeTab]) ? web.data.data[activeTab] : []
    if (sessionInitialized) { await saveAdminData(activeTab, arr); await syncAdminToWeb() }
    await loadWeb()
    setForm({}); setActiveSubTab('list')
  }

  const updateItem = async (id)=>{
    if (activeTab==='hsrCharacters') await axios.put(`${API_BASE_URL}/hsr/characters/${id}`, form)
    else if (activeTab==='hsrCones') await axios.put(`${API_BASE_URL}/hsr/cones/${id}`, form)
    else await axios.put(`${API_BASE_URL}/hsr/relics/${id}`, form)
    const web = await axios.get(`${API_BASE_URL}/dual-storage/web/data`)
    const arr = Array.isArray(web.data?.data?.[activeTab]) ? web.data.data[activeTab] : []
    if (sessionInitialized) { await saveAdminData(activeTab, arr); await syncAdminToWeb() }
    await loadWeb()
    setForm({}); setEditingItem(null)
  }

  const openEditModal = (item)=>{
    setEditModalData(item)
    setModalImagePreview(item.image||null)
    setShowEditModal(true)
  }
  const closeEditModal = ()=>{ setShowEditModal(false); setEditModalData({}); setModalImagePreview(null) }
  const handleModalInputChange = (e)=>{ const { name, value } = e.target; setEditModalData(prev=>({ ...prev, [name]: value })) }
  const handleModalFileChange = (e)=>{ const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onloadend=()=>{ setEditModalData(prev=>({ ...prev, image:r.result })); setModalImagePreview(r.result) }; r.readAsDataURL(f) }
  const saveEdit = async ()=>{
    const id = editModalData.id
    const payload = { ...editModalData }
    if (activeTab==='hsrCharacters') await axios.put(`${API_BASE_URL}/hsr/characters/${id}`, payload)
    else if (activeTab==='hsrCones') await axios.put(`${API_BASE_URL}/hsr/cones/${id}`, payload)
    else await axios.put(`${API_BASE_URL}/hsr/relics/${id}`, payload)
    const web = await axios.get(`${API_BASE_URL}/dual-storage/web/data`)
    const arr = Array.isArray(web.data?.data?.[activeTab]) ? web.data.data[activeTab] : []
    if (sessionInitialized) { await saveAdminData(activeTab, arr); await syncAdminToWeb() }
    await loadWeb()
    closeEditModal()
    alert('修改保存成功！')
  }

  const deleteItem = async (id)=>{
    if (!window.confirm('确定要删除这个项目吗？')) return
    try{
      if (activeTab==='hsrCharacters') await axios.delete(`${API_BASE_URL}/hsr/characters/${id}`)
      else if (activeTab==='hsrCones') await axios.delete(`${API_BASE_URL}/hsr/cones/${id}`)
      else await axios.delete(`${API_BASE_URL}/hsr/relics/${id}`)
      const web = await axios.get(`${API_BASE_URL}/dual-storage/web/data`)
      const arr = Array.isArray(web.data?.data?.[activeTab]) ? web.data.data[activeTab] : []
      if (sessionInitialized) { await saveAdminData(activeTab, arr); await syncAdminToWeb() }
      await loadWeb()
      alert('删除成功！')
    } catch(error){
      try{ const web = await axios.get(`${API_BASE_URL}/dual-storage/web/data`); const current = Array.isArray(web.data?.data?.[activeTab]) ? web.data.data[activeTab] : []; const arr = current.filter(x=> Number(x.id)!==Number(id)); if (sessionInitialized){ await saveAdminData(activeTab, arr); await syncAdminToWeb(); await loadWeb(); alert('删除成功（已从网页端移除并同步）') } }
      catch{};
    }
  }

  const renderForm = ()=>{
    if (activeTab==='hsrCharacters') return (
      <form className="admin-form card shadow-lg" onSubmit={(e)=>{e.preventDefault(); editingItem?updateItem(editingItem.id):addItem()}}>
        <h3 className="form-title">{editingItem?'编辑角色':'添加角色'}</h3>
        <div className="form-group"><label>名称:</label><input name="name" value={form.name||''} onChange={onChange} required /></div>
        <div className="form-group"><label>元素:</label><select name="elementId" value={form.elementId||''} onChange={onChange} required>
          <option value="">选择元素</option>{base.elements.map(el=> <option key={el.id} value={el.id}>{el.name}</option>)}
        </select></div>
        <div className="form-group"><label>命途:</label><select name="pathId" value={form.pathId||''} onChange={onChange} required>
          <option value="">选择命途</option>{base.paths.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></div>
        <div className="form-group"><label>稀有度:</label><select name="rarityId" value={form.rarityId||''} onChange={onChange} required>
          <option value="">选择稀有度</option>{base.rarities.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}
        </select></div>
        <div className="form-group"><label>图片:</label><input type="file" onChange={onFile} accept="image/*" />{imagePreview && <img src={imagePreview} alt="预览" className="image-preview" />}<input type="hidden" name="image" value={form.image||''} /></div>
        <div className="form-actions"><button type="submit" className="btn-primary">{editingItem?'更新':'添加'}</button>{editingItem&&<button type="button" className="btn-secondary" onClick={()=>{setEditingItem(null); setForm({})}}>取消</button>}</div>
      </form>
    )
    if (activeTab==='hsrCones') return (
      <form className="admin-form card shadow-lg" onSubmit={(e)=>{e.preventDefault(); editingItem?updateItem(editingItem.id):addItem()}}>
        <h3 className="form-title">{editingItem?'编辑光锥':'添加光锥'}</h3>
        <div className="form-group"><label>名称:</label><input name="name" value={form.name||''} onChange={onChange} required /></div>
        <div className="form-group"><label>命途:</label><select name="pathId" value={form.pathId||''} onChange={onChange} required>
          <option value="">选择命途</option>{base.paths.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></div>
        <div className="form-group"><label>稀有度:</label><select name="rarityId" value={form.rarityId||''} onChange={onChange} required>
          <option value="">选择稀有度</option>{base.rarities.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}
        </select></div>
        <div className="form-group"><label>图片:</label><input type="file" onChange={onFile} accept="image/*" />{imagePreview && <img src={imagePreview} alt="预览" className="image-preview" />}<input type="hidden" name="image" value={form.image||''} /></div>
        <div className="form-actions"><button type="submit" className="btn-primary">{editingItem?'更新':'添加'}</button>{editingItem&&<button type="button" className="btn-secondary" onClick={()=>{setEditingItem(null); setForm({})}}>取消</button>}</div>
      </form>
    )
    return (
      <form className="admin-form card shadow-lg" onSubmit={(e)=>{e.preventDefault(); editingItem?updateItem(editingItem.id):addItem()}}>
        <h3 className="form-title">{editingItem?'编辑遗器':'添加遗器'}</h3>
        <div className="form-group"><label>名称:</label><input name="name" value={form.name||''} onChange={onChange} required /></div>
        <div className="form-group"><label>类型:</label><select name="typeId" value={form.typeId||''} onChange={onChange} required>
          <option value="">选择类型</option>{base.relicTypes.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></div>
        <div className="form-group"><label>套装名:</label><input name="setName" value={form.setName||''} onChange={onChange} /></div>
        <div className="form-group"><label>部位:</label><select name="part" value={form.part||''} onChange={onChange}>
          <option value="">选择部位</option>{base.relicParts.map(p=> <option key={p} value={p}>{p}</option>)}
        </select></div>
        <div className="form-group"><label>图片:</label><input type="file" onChange={onFile} accept="image/*" />{imagePreview && <img src={imagePreview} alt="预览" className="image-preview" />}<input type="hidden" name="image" value={form.image||''} /></div>
        <div className="form-actions"><button type="submit" className="btn-primary">{editingItem?'更新':'添加'}</button>{editingItem&&<button type="button" className="btn-secondary" onClick={()=>{setEditingItem(null); setForm({})}}>取消</button>}</div>
      </form>
    )
  }

  const list = (type)=> (Array.isArray(data[type])?data[type]:[])
  

  return (
    <div className="third-div">
      <div className="sidebar">
        <div className="sidebar-header"><Link to="/hsr-wiki" className="home-link"><h2 className="wiki-title">HengHSR 管理</h2></Link></div>
        <nav className="sidebar-nav">
          <ul className="nav-menu">
            <li className="nav-item has-submenu">
              <button className={`nav-link ${activeTab==='hsrCharacters'?'active':''}`} onClick={()=>{setActiveTab('hsrCharacters'); setActiveSubTab('add')}}>角色<span className="arrow-icon">&#9660;</span></button>
              {activeTab==='hsrCharacters' && (
                <ul className="submenu"><li className={activeSubTab==='add'?'active':''} onClick={(e)=>{e.stopPropagation(); setActiveSubTab('add')}}>添加</li><li className={activeSubTab==='list'?'active':''} onClick={(e)=>{e.stopPropagation(); setActiveSubTab('list')}}>列表</li></ul>
              )}
            </li>
            <li className="nav-item has-submenu">
              <button className={`nav-link ${activeTab==='hsrCones'?'active':''}`} onClick={()=>{setActiveTab('hsrCones'); setActiveSubTab('add')}}>光锥<span className="arrow-icon">&#9660;</span></button>
              {activeTab==='hsrCones' && (
                <ul className="submenu"><li className={activeSubTab==='add'?'active':''} onClick={(e)=>{e.stopPropagation(); setActiveSubTab('add')}}>添加</li><li className={activeSubTab==='list'?'active':''} onClick={(e)=>{e.stopPropagation(); setActiveSubTab('list')}}>列表</li></ul>
              )}
            </li>
            <li className="nav-item has-submenu">
              <button className={`nav-link ${activeTab==='hsrRelics'?'active':''}`} onClick={()=>{setActiveTab('hsrRelics'); setActiveSubTab('add')}}>遗器<span className="arrow-icon">&#9660;</span></button>
              {activeTab==='hsrRelics' && (
                <ul className="submenu"><li className={activeSubTab==='add'?'active':''} onClick={(e)=>{e.stopPropagation(); setActiveSubTab('add')}}>添加</li><li className={activeSubTab==='list'?'active':''} onClick={(e)=>{e.stopPropagation(); setActiveSubTab('list')}}>列表</li></ul>
              )}
            </li>
          </ul>
        </nav>
        <div className="update-button-container">
          <div className="sync-buttons">
            <button className={`update-button ${hasAdminChanges ? 'primary urgent' : 'primary'}`} onClick={async()=>{setSyncLoading(true); try{ await syncAdminToWeb(); setHasAdminChanges(false) } finally { setSyncLoading(false) }}} disabled={syncLoading || !sessionInitialized} title={!sessionInitialized ? '请等待管理员会话初始化完成' : '将管理员端修改同步到网页端'}>
              {syncLoading ? '同步中...' : hasAdminChanges ? '同步修改到网页端' : '同步数据'}
            </button>
          </div>
        </div>
      </div>
      <div className="main-content">
        <div className="admin-header-full"><h2>HSR 管理员面板</h2></div>
        <div className="admin-main-content-full">
          {activeSubTab==='add' ? (
            <div className="admin-form-full-page">{renderForm()}</div>
          ) : (
            <div className="admin-list-full"><div className="admin-list-container">
              <div className="content-grid">
              {list(activeTab).map(item=> (
                <div key={item.id} className="card shadow-md">
                  <img src={item.image||star} alt={item.name} className="card-image" onError={(e)=>{e.target.src=star}} />
                  <div className="card-content"><h3 className="card-title">{item.name}</h3></div>
                  <div className="card-actions"><button className="btn-edit" onClick={()=>openEditModal(item)}>编辑</button><button className="btn-delete" onClick={()=>deleteItem(item.id)}>删除</button></div>
                </div>
              ))}
              </div>
            </div></div>
          )}
          <div className="sync-buttons">
            <button className="update-button secondary" onClick={loadDualStorageStatus} disabled={syncLoading} title="刷新存储系统状态">🔄 刷新状态</button>
          </div>
          {showEditModal && (
            <div className="modal-overlay" onClick={closeEditModal}>
              <div className="modal-content" onClick={(e)=>e.stopPropagation()}>
                <div className="modal-header"><h3>编辑{activeTab==='hsrCharacters'?'角色':activeTab==='hsrCones'?'光锥':'遗器'}</h3><button className="modal-close" onClick={closeEditModal}>×</button></div>
                <div className="modal-body">
                  <div className="form-group"><label>名称:</label><input name="name" value={editModalData.name||''} onChange={handleModalInputChange} /></div>
                  {activeTab==='hsrCharacters' && (
                    <>
                      <div className="form-group"><label>元素:</label><select name="elementId" value={editModalData.elementId||''} onChange={handleModalInputChange}><option value="">选择元素</option>{base.elements.map(el=> <option key={el.id} value={el.id}>{el.name}</option>)}</select></div>
                      <div className="form-group"><label>命途:</label><select name="pathId" value={editModalData.pathId||''} onChange={handleModalInputChange}><option value="">选择命途</option>{base.paths.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                      <div className="form-group"><label>稀有度:</label><select name="rarityId" value={editModalData.rarityId||''} onChange={handleModalInputChange}><option value="">选择稀有度</option>{base.rarities.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
                    </>
                  )}
                  {activeTab==='hsrCones' && (
                    <>
                      <div className="form-group"><label>命途:</label><select name="pathId" value={editModalData.pathId||''} onChange={handleModalInputChange}><option value="">选择命途</option>{base.paths.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                      <div className="form-group"><label>稀有度:</label><select name="rarityId" value={editModalData.rarityId||''} onChange={handleModalInputChange}><option value="">选择稀有度</option>{base.rarities.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
                    </>
                  )}
                  {activeTab==='hsrRelics' && (
                    <>
                      <div className="form-group"><label>类型:</label><select name="typeId" value={editModalData.typeId||''} onChange={handleModalInputChange}><option value="">选择类型</option>{base.relicTypes.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                      <div className="form-group"><label>套装名:</label><input name="setName" value={editModalData.setName||''} onChange={handleModalInputChange} /></div>
                      <div className="form-group"><label>部位:</label><select name="part" value={editModalData.part||''} onChange={handleModalInputChange}><option value="">选择部位</option>{base.relicParts.map(p=> <option key={p} value={p}>{p}</option>)}</select></div>
                    </>
                  )}
                  <div className="form-group"><label>图片:</label><input type="file" onChange={handleModalFileChange} accept="image/*" />{modalImagePreview && <img src={modalImagePreview} alt="预览" className="image-preview" />}</div>
                </div>
                <div className="modal-footer"><button className="btn-secondary" onClick={closeEditModal}>取消</button><button className="btn-primary" onClick={saveEdit}>保存</button></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(HsrAdminPanel)
