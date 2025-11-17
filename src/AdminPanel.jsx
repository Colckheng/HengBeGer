import React, { useState, useRef, memo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from './DataContext';
import axios from 'axios';
const API_BASE_URL = import.meta?.env?.DEV ? '/api' : '/api';
import './ZZZWiki.css';

const AdminPanel = () => {
  const { data, baseData, loading, error, handleAddAgent, handleUpdateAgent, handleDeleteAgent, handleAddSoundEngine, handleUpdateSoundEngine, handleDeleteSoundEngine, handleAddBumbo, handleUpdateBumbo, handleDeleteBumbo, handleAddDriveDisk, handleUpdateDriveDisk, handleDeleteDriveDisk, handleUpdateData } = useData();
  const [activeTab, setActiveTab] = useState('agents');
  const [activeSubTab, setActiveSubTab] = useState('add'); // 'add' 或 'list'
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  
  // 双存储系统相关状态
  const [adminData, setAdminData] = useState({});
  const [dualStorageStatus, setDualStorageStatus] = useState({
    initialized: false,
    adminSessionActive: false,
    lastSync: null,
    dataCount: 0
  });
  const [syncLoading, setSyncLoading] = useState(false);
  const [hasAdminChanges, setHasAdminChanges] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [storageData, setStorageData] = useState({});
  const [storageStatus, setStorageStatus] = useState({});
  
  // 编辑弹窗状态
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalData, setEditModalData] = useState({});

  // 初始化管理员会话
  useEffect(() => {
    const initializeAdminSession = async () => {
      try {
        // 1. 首先初始化双存储系统
        const initResponse = await axios.post(`${API_BASE_URL}/dual-storage/initialize`);
        
        // 2. 初始化管理员会话（复制网页端数据到管理员端）
        const sessionResponse = await axios.post(`${API_BASE_URL}/dual-storage/admin/session`);
        if (sessionResponse.data.success) {
          setSessionInitialized(true);
          
          // 3. 加载管理员端数据
          await loadAdminData();
          
          // 4. 加载双存储系统状态
          await loadDualStorageStatus();
        }
      } catch (error) {
        // 即使初始化失败，也尝试加载现有数据
        await loadAdminData();
      }
    };
    
    initializeAdminSession();
  }, []);

  // 处理表单变化
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setHasAdminChanges(true); // 标记有管理员端修改
  };

  // 处理文件上传
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // 保存base64格式的图片数据
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result }));
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  // 选择要编辑的项目 - 打开编辑弹窗
  const handleEdit = (item) => {
    setEditModalData(item);
    setShowEditModal(true);
  };
  
  // 关闭编辑弹窗
  const closeEditModal = () => {
    setShowEditModal(false);
    setEditModalData({});
  };
  
  // 保存编辑
  const saveEdit = async (updatedData) => {
    try {

      
      if (!editModalData || !editModalData.id) {
        throw new Error('编辑数据无效，缺少ID');
      }
      
      // 确保数字字段的类型正确
      const processedData = { ...updatedData };
      if (activeTab === 'agents') {
        if (processedData.factionId) processedData.factionId = parseInt(processedData.factionId);
        if (processedData.roleId) processedData.roleId = parseInt(processedData.roleId);
        if (processedData.rarityId) processedData.rarityId = parseInt(processedData.rarityId);
      }

      
      let result;
      
      switch (activeTab) {
        case 'agents':
          await handleUpdateAgent(editModalData.id, processedData);
          result = data.agents;
          break;
        case 'soundEngines':
          await handleUpdateSoundEngine(editModalData.id, processedData);
          result = data.soundEngines;
          break;
        case 'bumbos':
          await handleUpdateBumbo(editModalData.id, processedData);
          result = data.bumbos;
          break;
        case 'driveDisks':
          await handleUpdateDriveDisk(editModalData.id, processedData);
          result = data.driveDisks;
          break;
        default:
          throw new Error('未知的activeTab: ' + activeTab);
      }
      

      
      // 保存到管理员端存储
      if (result && sessionInitialized) {
        await saveAdminData(activeTab, result);
      }
      
      closeEditModal();
      alert('修改保存成功！');
    } catch (error) {
      alert('保存失败: ' + error.message);
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingItem(null);
    setFormData({});
    setImagePreview(null);
  };

  // 提交表单（添加或更新）
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      let updatedData;
      
      if (editingItem) {
        switch (activeTab) {
          case 'agents':
            await handleUpdateAgent(editingItem.id, formData);
            updatedData = data.agents;
            break;
          case 'soundEngines':
            await handleUpdateSoundEngine(editingItem.id, formData);
            updatedData = data.soundEngines;
            break;
          case 'bumbos':
            await handleUpdateBumbo(editingItem.id, formData);
            updatedData = data.bumbos;
            break;
          case 'driveDisks':
            await handleUpdateDriveDisk(editingItem.id, formData);
            updatedData = data.driveDisks;
            break;
          default:
            break;
        }
      } else {
        switch (activeTab) {
          case 'agents':
            await handleAddAgent(formData);
            break;
          case 'soundEngines':
            await handleAddSoundEngine(formData);
            break;
          case 'bumbos':
            await handleAddBumbo(formData);
            break;
          case 'driveDisks':
            await handleAddDriveDisk(formData);
            break;
          default:
            break;
        }
        const storageResp = await axios.get(`${API_BASE_URL}/storage/data`);
        const storageData = storageResp.data?.data || {};
        const pick = (t) => Array.isArray(storageData[t]?.data) ? storageData[t].data : [];
        if (activeTab === 'agents') updatedData = pick('agents');
        if (activeTab === 'soundEngines') updatedData = pick('soundEngines');
        if (activeTab === 'bumbos') updatedData = pick('bumbos');
        if (activeTab === 'driveDisks') updatedData = pick('driveDisks');
      }

      // 保存到管理员端存储
      if (updatedData && sessionInitialized) {
        await saveAdminData(activeTab, updatedData);
        try {
          const syncResp = await axios.post(`${API_BASE_URL}/dual-storage/sync`);
          if (syncResp.data?.success) {
            await handleUpdateData();
            await loadDualStorageStatus();
          }
        } catch {}
      }

      // 重置表单
      setEditingItem(null);
      setFormData({});
      setImagePreview(null);
      
      // 如果是添加操作，自动切换到列表视图
      if (!editingItem) {
        setActiveSubTab('list');
      }
    } catch (error) {
      alert('操作失败: ' + error.message);
    }
  };

  // 删除项目函数
  const deleteItem = async (type, id) => {
    if (window.confirm('确定要删除这个项目吗？')) {
      try {

        
        if (!id) {
          throw new Error('删除失败：缺少项目ID');
        }
        
        let updatedData;
        
        switch (type) {
          case 'agents':
            await handleDeleteAgent(id);
            break;
          case 'soundEngines':
            await handleDeleteSoundEngine(id);
            break;
          case 'bumbos':
            await handleDeleteBumbo(id);
            break;
          case 'driveDisks':
            await handleDeleteDriveDisk(id);
            break;
          default:
            throw new Error('未知的删除类型: ' + type);
        }
        

        
        // 从根存储拉取最新数组，保存到管理员端并同步到网页端
        const storageResp = await axios.get(`${API_BASE_URL}/storage/data`);
        const storageData = storageResp.data?.data || {};
        const pick = (t) => Array.isArray(storageData[t]?.data) ? storageData[t].data : [];
        if (sessionInitialized) {
          const arr = pick(type);
          await saveAdminData(type, arr);
          try {
            const syncResp = await axios.post(`${API_BASE_URL}/dual-storage/sync`);
            if (syncResp.data?.success) {
              await handleUpdateData();
              await loadDualStorageStatus();
            }
          } catch {}
        }
        
        alert('删除成功！');
      } catch (error) {
          try {
            const storageResp = await axios.get(`${API_BASE_URL}/storage/data`);
            const storageData = storageResp.data?.data || {};
            const pick = (t) => Array.isArray(storageData[t]?.data) ? storageData[t].data : [];
            const arr = pick(type).filter(item => Number(item.id) !== Number(id));
            if (sessionInitialized) {
              await saveAdminData(type, arr);
              const syncResp = await axios.post(`${API_BASE_URL}/dual-storage/sync`);
              if (syncResp.data?.success) {
                await handleUpdateData();
                await loadDualStorageStatus();
                alert('后端删除失败，已从网页端数据移除并同步');
                return;
              }
            }
          } catch {}
          alert('删除失败: ' + error.message);
        }
    }
  };

  // 处理删除 - 使用deleteItem函数
  const handleDelete = async (id) => {
    await deleteItem(activeTab, id);
  };

  // 加载管理员端数据
  const loadAdminData = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/dual-storage/admin/data`);
      if (response.data.success) {
        setAdminData(response.data.data);
      }
    } catch (error) {
      // 静默处理错误
    }
  };

  // 加载双存储系统状态
  const loadDualStorageStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/dual-storage/status`);
      if (response.data.success) {
        const status = response.data.status;
        setDualStorageStatus({
          initialized: status.initialized,
          adminSessionActive: sessionInitialized,
          lastSync: status.web?.agents?.lastUpdated || null,
          dataCount: Object.values(status.admin || {}).reduce((sum, item) => sum + (item.count || 0), 0)
        });
      }
    } catch (error) {
      // 静默处理错误
    }
  };

  // 保存管理员端数据
  const saveAdminData = async (type, data) => {
    try {
      const response = await axios.put(`${API_BASE_URL}/dual-storage/admin/${type}`, { data });
      if (response.data.success) {
        setHasAdminChanges(true);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  };

  // 统一更新数据函数 - 将管理员端数据同步到网页端
  const handleUnifiedUpdate = async () => {
    if (!window.confirm('确定要更新数据吗？这将把管理员端的修改同步到网页端显示。')) {
      return;
    }
    setSyncLoading(true);
    try {
      // 1. 同步管理员端数据到网页端
      const syncResponse = await axios.post(`${API_BASE_URL}/dual-storage/sync`);
      if (syncResponse.data.success) {
        // 2. 刷新前端显示的数据（从网页端重新加载）
        await handleUpdateData();
        
        // 3. 更新双存储系统状态
        await loadDualStorageStatus();
        
        alert('数据更新成功！管理员端的修改已同步到网页端。');
        setHasAdminChanges(false);
      } else {
        throw new Error(syncResponse.data.message || '同步失败');
      }
    } catch (error) {
      alert('更新数据失败: ' + error.message);
    } finally {
      setSyncLoading(false);
    }
  };

  // 存储系统相关函数
  const loadStorageData = async (type = null) => {
    try {
      const url = type ? `${API_BASE_URL}/storage/${type}` : `${API_BASE_URL}/storage/data`;
      const response = await axios.get(url);
      if (response.data.success) {
        if (type) {
          setStorageData(prev => ({ ...prev, [type]: response.data.data }));
        } else {
          setStorageData(response.data.data);
        }
      }
    } catch (error) {
      // 静默处理错误
    }
  };

  const loadStorageStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/storage/status`);
      if (response.data.success) {
        const status = response.data.status;
        // 转换API返回的复杂状态为前端期望的简单格式
        const totalCount = Object.values(status.files || {}).reduce((sum, file) => {
          return sum + (file.count || 0);
        }, 0);
        
        const lastSync = Object.values(status.files || {}).reduce((latest, file) => {
          if (file.lastUpdated && (!latest || new Date(file.lastUpdated) > new Date(latest))) {
            return file.lastUpdated;
          }
          return latest;
        }, null);
        
        setStorageStatus({
          connected: status.initialized || false,
          lastSync: lastSync,
          dataCount: totalCount
        });
      } else {
        console.error('加载存储状态失败:', response.data.message);
        setStorageStatus({
          connected: false,
          lastSync: null,
          dataCount: 0
        });
      }
    } catch (error) {
      console.error('加载存储状态失败:', error);
      setStorageStatus({
        connected: false,
        lastSync: null,
        dataCount: 0
      });
    }
  };

  const saveStorageData = async (type, data) => {
    setSyncLoading(true);
    try {
      await axios.put(`http://localhost:3001/api/storage/${type}`, data);
      setHasStorageChanges(false);
      alert('数据保存到存储系统成功！');
      await loadStorageStatus();
    } catch (error) {
      console.error('保存存储数据失败:', error);
      alert('保存数据失败: ' + error.message);
    } finally {
      setSyncLoading(false);
    }
  };

  // 原有的同步和重置函数已被handleUnifiedUpdate替代

  // 组件挂载时加载存储数据和状态
  useEffect(() => {
    loadStorageData();
    loadStorageStatus();
  }, []);


  // 渲染表单
  const renderForm = () => {
    switch(activeTab) {
      case 'agents':
        return (
          <form onSubmit={handleSubmit} className="admin-form card shadow-lg">
            <h3 className="form-title">{editingItem ? '编辑代理人' : '添加代理人'}</h3>
            <div className="form-group">
              <label>名称:</label>
              <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required className="agent-name-input" style={{width: '250px', minWidth: '250px', maxWidth: '250px', boxSizing: 'border-box'}} />
            </div>
            <div className="form-group">
              <label>职业:</label>
              <select name="roleId" value={formData.roleId || ''} onChange={handleInputChange} required>
                <option value="">选择职业</option>
                {baseData?.roles?.map(role => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>阵营:</label>
              <select name="factionId" value={formData.factionId || ''} onChange={handleInputChange} required>
                <option value="">选择阵营</option>
                {baseData?.factions?.map(faction => (
                  <option key={faction.id} value={faction.id}>{faction.name}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>属性:</label>
              <select name="element" value={formData.element || ''} onChange={handleInputChange} required>
                <option value="">选择属性</option>
                <option value="物理">物理</option>
                <option value="火">火</option>
                <option value="冰">冰</option>
                <option value="电">电</option>
                <option value="以太">以太</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>图片:</label>
              <input type="file" name="imageFile" onChange={handleFileChange} accept="image/*" />
              <input type="hidden" name="image" value={formData.image || ''} />
            </div>
            <div className="form-group">
              <label>稀有度:</label>
              <select name="rarityId" value={formData.rarityId || ''} onChange={handleInputChange} required>
                <option value="">选择稀有度</option>
                {baseData?.rarities?.filter(rarity => rarity.name === 'S' || rarity.name === 'A').map(rarity => (
                  <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
                ))}
              </select>
            </div>
            
            <div className="form-actions">
              <button type="submit" className="btn-primary">{editingItem ? '更新' : '添加'}</button>
              {editingItem && <button type="button" onClick={handleCancelEdit} className="btn-secondary">取消</button>}
            </div>
          </form>
        );
      case 'soundEngines':
        return (
          <form onSubmit={handleSubmit} className="admin-form card shadow-lg">
            <h3 className="form-title">{editingItem ? '编辑音擎' : '添加音擎'}</h3>
            <div className="form-group">
              <label>名称:</label>
              <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required className="agent-name-input" style={{width: '250px', minWidth: '250px', maxWidth: '250px', boxSizing: 'border-box'}} />
            </div>
            <div className="form-group">
              <label>职业:</label>
              <select name="role" value={formData.role || ''} onChange={handleInputChange} required>
                <option value="">选择职业</option>
                {baseData?.roles?.map(role => (
                  <option key={role.id} value={role.name}>{role.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>图片:</label>
              <input type="file" name="imageFile" onChange={handleFileChange} accept="image/*" />
              <input type="hidden" name="image" value={formData.image || ''} />
            </div>
            <div className="form-group">
              <label>稀有度:</label>
              <select name="rarityId" value={formData.rarityId || ''} onChange={handleInputChange} required>
                <option value="">选择稀有度</option>
                {baseData?.rarities?.map(rarity => (
                  <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">{editingItem ? '更新' : '添加'}</button>
              {editingItem && <button type="button" onClick={handleCancelEdit} className="btn-secondary">取消</button>}
            </div>
          </form>
        );
      case 'bumbos':
        return (
          <form onSubmit={handleSubmit} className="admin-form card shadow-lg">
            <h3 className="form-title">{editingItem ? '编辑邦布' : '添加邦布'}</h3>
            <div className="form-group">
              <label>名称:</label>
              <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required className="agent-name-input" style={{width: '250px', minWidth: '250px', maxWidth: '250px', boxSizing: 'border-box'}} />
            </div>

            <div className="form-group">
              <label>图片:</label>
              <input type="file" name="imageFile" onChange={handleFileChange} accept="image/*" />
              <input type="hidden" name="image" value={formData.image || ''} />
            </div>
            <div className="form-group">
              <label>稀有度:</label>
              <select name="rarityId" value={formData.rarityId || ''} onChange={handleInputChange} required>
                <option value="">选择稀有度</option>
                {baseData?.rarities?.filter(rarity => rarity.name === 'S' || rarity.name === 'A').map(rarity => (
                  <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">{editingItem ? '更新' : '添加'}</button>
              {editingItem && <button type="button" onClick={handleCancelEdit} className="btn-secondary">取消</button>}
            </div>
          </form>
        );
      case 'driveDisks':
        return (
          <form onSubmit={handleSubmit} className="admin-form card shadow-lg">
            <h3 className="form-title">{editingItem ? '编辑驱动盘' : '添加驱动盘'}</h3>
            <div className="form-group">
              <label>名称:</label>
              <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required className="agent-name-input" style={{width: '250px', minWidth: '250px', maxWidth: '250px', boxSizing: 'border-box'}} />
            </div>
            <div className="form-group">
              <label>图片:</label>
              <input type="file" name="imageFile" onChange={handleFileChange} accept="image/*" />
              {imagePreview && <img src={imagePreview} alt="预览" className="image-preview" />}
              <input type="hidden" name="image" value={formData.image || ''} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">{editingItem ? '更新' : '添加'}</button>
              {editingItem && <button type="button" onClick={handleCancelEdit} className="btn-secondary">取消</button>}
            </div>
          </form>
        );
      default:
        return null;
    }
  };

  // 渲染列表
  const renderList = () => {
    switch(activeTab) {
      case 'agents':
        return (
          <div className="admin-list-section">
            <h3 className="section-title">代理人列表</h3>
            <div className="content-grid">
              {Array.isArray(data.agents) ? data.agents.map(item => (
                <div key={item.id} className="card shadow-md">
                  <img src={item.image} alt={item.name} className="card-image" />
                  <div className="card-content">
                    <h3 className="card-title">{item.name}</h3>
                    <p className="card-subtitle">{item.role || item.Role?.name || '未知职业'}</p>
                    <div className="card-footer">
                      <span className="rarity-badge" data-rarity={item.rarity || item.Rarity?.name}>{item.rarity || item.Rarity?.name || 'B'}</span>
                      <span className="faction-tag">{item.faction || item.Faction?.name || '未知阵营'}</span>
                    </div>
                  </div>
                  <div className="card-actions">
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="btn-edit">编辑</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem('agents', item.id); }} className="btn-delete">删除</button>
                  </div>
                </div>
              )) : <div>暂无数据</div>}
            </div>
          </div>
        );
      case 'soundEngines':
        return (
          <div className="admin-list-section">
            <h3 className="section-title">音擎列表</h3>
            <div className="content-grid">
              {Array.isArray(data.soundEngines) ? data.soundEngines.map(item => (
                <div key={item.id} className="card shadow-md">
                  <img src={item.image} alt={item.name} className="card-image" />
                  <div className="card-content">
                    <h3 className="card-title">{item.name}</h3>
                    <p className="card-subtitle">类型: {item.type}</p>
                    <div className="card-meta">
                      <span className="rarity-badge" data-rarity={item.rarity || item.Rarity?.name}>{item.rarity || item.Rarity?.name || 'B'}</span>
                    </div>
                  </div>
                  <div className="card-actions">
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="btn-edit">编辑</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem('soundEngines', item.id); }} className="btn-delete">删除</button>
                  </div>
                </div>
              )) : <div>暂无数据</div>}
            </div>
          </div>
        );
      case 'bumbos':
        return (
          <div className="admin-list-section">
            <h3 className="section-title">邦布列表</h3>
            <div className="content-grid">
              {Array.isArray(data.bumbos) ? data.bumbos.map(item => (
                <div key={item.id} className="card shadow-md">
                  <img src={item.image} alt={item.name} className="card-image" />
                  <div className="card-content">
                    <h3 className="card-title">{item.name}</h3>
                    <p className="card-subtitle">元素: {item.element}</p>
                    <div className="card-meta">
                      <span className="rarity-badge" data-rarity={item.rarity || item.Rarity?.name}>{item.rarity || item.Rarity?.name || 'A'}</span>
                      <span className="element-tag" data-element={item.element}>{item.element}</span>
                    </div>
                  </div>
                  <div className="card-actions">
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="btn-edit">编辑</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem('bumbos', item.id); }} className="btn-delete">删除</button>
                  </div>
                </div>
              )) : <div>暂无数据</div>}
            </div>
          </div>
        );
      case 'driveDisks':
        return (
          <div className="admin-list-section">
            <h3 className="section-title">驱动盘列表</h3>
            <div className="content-grid">
              {Array.isArray(data.driveDisks) ? data.driveDisks.map(item => (
                <div key={item.id} className="card shadow-md">
                  <img src={item.image} alt={item.name} className="card-image" />
                  <div className="card-content">
                    <h3 className="card-title">{item.name}</h3>
                    <p className="card-description">{item.effect}</p>
                    <div className="card-meta">
                      <span className="rarity-badge" data-rarity={item.rarity}>{item.rarity}</span>
                    </div>
                  </div>
                  <div className="card-actions">
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="btn-edit">编辑</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem('driveDisks', item.id); }} className="btn-delete">删除</button>
                  </div>
                </div>
              )) : <div>暂无数据</div>}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // 编辑弹窗组件
  const EditModal = () => {
    const [modalFormData, setModalFormData] = useState({...editModalData});
    
    useEffect(() => {
      setModalFormData({...editModalData});
    }, [editModalData]);
    
    const handleModalInputChange = (e) => {
      const { name, value } = e.target;
      setModalFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleModalSave = () => {
      console.log('Modal save clicked, modalFormData:', modalFormData);
      console.log('editModalData:', editModalData);
      saveEdit(modalFormData);
    };
    
    if (!showEditModal) return null;
    
    return (
      <div className="modal-overlay" onClick={closeEditModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>编辑{activeTab === 'agents' ? '代理人' : activeTab === 'soundEngines' ? '音擎' : activeTab === 'bumbos' ? '邦布' : '驱动盘'}</h3>
            <button className="modal-close" onClick={closeEditModal}>×</button>
          </div>
          <div className="modal-body">
            {activeTab === 'agents' && (
              <>
                <div className="form-group">
                  <label>名称:</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={modalFormData.name || ''} 
                    onChange={handleModalInputChange} 
                  />
                </div>
                <div className="form-group">
                  <label>等级:</label>
                  <select name="rarityId" value={modalFormData.rarityId || ''} onChange={handleModalInputChange}>
                    <option value="">选择等级</option>
                    {baseData?.rarities?.map(rarity => (
                      <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>阵营:</label>
                  <select name="factionId" value={modalFormData.factionId || ''} onChange={handleModalInputChange}>
                    <option value="">选择阵营</option>
                    {baseData?.factions?.map(faction => (
                      <option key={faction.id} value={faction.id}>{faction.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>职业:</label>
                  <select name="roleId" value={modalFormData.roleId || ''} onChange={handleModalInputChange}>
                    <option value="">选择职业</option>
                    {baseData?.roles?.map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {activeTab === 'soundEngines' && (
              <>
                <div className="form-group">
                  <label>名称:</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={modalFormData.name || ''} 
                    onChange={handleModalInputChange} 
                  />
                </div>
                <div className="form-group">
                  <label>类型:</label>
                  <select name="type" value={modalFormData.type || ''} onChange={handleModalInputChange}>
                    <option value="">选择类型</option>
                    <option value="攻击">攻击</option>
                    <option value="防御">防御</option>
                    <option value="辅助">辅助</option>
                  </select>
                </div>
              </>
            )}
            {activeTab === 'bumbos' && (
              <>
                <div className="form-group">
                  <label>名称:</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={modalFormData.name || ''} 
                    onChange={handleModalInputChange} 
                  />
                </div>
              </>
            )}
            {activeTab === 'driveDisks' && (
              <>
                <div className="form-group">
                  <label>名称:</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={modalFormData.name || ''} 
                    onChange={handleModalInputChange} 
                  />
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn-secondary" onClick={closeEditModal}>取消</button>
            <button className="btn-primary" onClick={handleModalSave}>保存</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="third-div">
      <EditModal />
      <div className="sidebar">
        <div className="sidebar-header">
          <Link to="/zzz-wiki" className="home-link"><h2 className="wiki-title">HengZZZ</h2></Link>
        </div>
        <nav className="sidebar-nav">
          <ul className="nav-menu">
            <li className="nav-item has-submenu">
              <button
                className={`nav-link ${activeTab === 'agents' ? 'active' : ''}`}
                onClick={() => {setActiveTab('agents'); setActiveSubTab('add');}}
              >
                代理人
                <span className="arrow-icon">&#9660;</span>
              </button>
              {activeTab === 'agents' && (
                <ul className="submenu">
                  <li
                    className={activeSubTab === 'add' ? 'active' : ''}
                    onClick={(e) => {e.stopPropagation(); setActiveSubTab('add');}}
                  >
                    添加
                  </li>
                  <li
                    className={activeSubTab === 'list' ? 'active' : ''}
                    onClick={(e) => {e.stopPropagation(); setActiveSubTab('list');}}
                  >
                    列表
                  </li>
                </ul>
              )}
            </li>
            <li className="nav-item has-submenu">
              <button
                className={`nav-link ${activeTab === 'soundEngines' ? 'active' : ''}`}
                onClick={() => {setActiveTab('soundEngines'); setActiveSubTab('add');}}
              >
                音擎
                <span className="arrow-icon">&#9660;</span>
              </button>
              {activeTab === 'soundEngines' && (
                <ul className="submenu">
                  <li
                    className={activeSubTab === 'add' ? 'active' : ''}
                    onClick={(e) => {e.stopPropagation(); setActiveSubTab('add');}}
                  >
                    添加
                  </li>
                  <li
                    className={activeSubTab === 'list' ? 'active' : ''}
                    onClick={(e) => {e.stopPropagation(); setActiveSubTab('list');}}
                  >
                    列表
                  </li>
                </ul>
              )}
            </li>
            <li className="nav-item has-submenu">
              <button
                className={`nav-link ${activeTab === 'bumbos' ? 'active' : ''}`}
                onClick={() => {setActiveTab('bumbos'); setActiveSubTab('add');}}
              >
                邦布
                <span className="arrow-icon">&#9660;</span>
              </button>
              {activeTab === 'bumbos' && (
                <ul className="submenu">
                  <li
                    className={activeSubTab === 'add' ? 'active' : ''}
                    onClick={(e) => {e.stopPropagation(); setActiveSubTab('add');}}
                  >
                    添加
                  </li>
                  <li
                    className={activeSubTab === 'list' ? 'active' : ''}
                    onClick={(e) => {e.stopPropagation(); setActiveSubTab('list');}}
                  >
                    列表
                  </li>
                </ul>
              )}
            </li>
            <li className="nav-item has-submenu">
              <button
                className={`nav-link ${activeTab === 'driveDisks' ? 'active' : ''}`}
                onClick={() => {setActiveTab('driveDisks'); setActiveSubTab('add');}}
              >
                驱动盘
                <span className="arrow-icon">&#9660;</span>
              </button>
              {activeTab === 'driveDisks' && (
                <ul className="submenu">
                  <li
                    className={activeSubTab === 'add' ? 'active' : ''}
                    onClick={(e) => {e.stopPropagation(); setActiveSubTab('add');}}
                  >
                    添加
                  </li>
                  <li
                    className={activeSubTab === 'list' ? 'active' : ''}
                    onClick={(e) => {e.stopPropagation(); setActiveSubTab('list');}}
                  >
                    列表
                  </li>
                </ul>
              )}
            </li>
          </ul>
        </nav>
        <div className="update-button-container">
          <div className="sync-buttons">
            <button
              className={`update-button ${hasAdminChanges ? 'primary urgent' : 'primary'}`}
              onClick={handleUnifiedUpdate}
              disabled={syncLoading || !sessionInitialized}
              title={!sessionInitialized ? '请等待管理员会话初始化完成' : '将管理员端修改同步到网页端'}
            >
              {syncLoading ? '同步中...' : hasAdminChanges ? '同步修改到网页端' : '同步数据'}
            </button>
            
            <button
              className="update-button secondary"
              onClick={loadDualStorageStatus}
              disabled={syncLoading}
              title="刷新存储系统状态"
            >
              🔄 刷新状态
            </button>
          </div>
        </div>
      </div>
      <div className="main-content">
        <div className="admin-header-full">
          <h2>管理员面板</h2>
        </div>
        <div className="admin-main-content-full">
          {activeSubTab === 'add' ? (
            <div className="admin-form-full-page">
              {renderForm()}
            </div>
          ) : (
            <div className="admin-list-full">
              <div className="admin-list-container">
                {renderList()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(AdminPanel);
