import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import { useData } from './DataContext.jsx';
import logoutAdminSession from './utils/adminLogout.js';
import { getApiErrorMessage } from './utils/apiError.js';
import { validateAdminImageFile } from './utils/imageUpload.js';
import './ZZZWiki.css';

const EMPTY_FORM = {};

const buildFileReader = (file, onLoad) => {
  const reader = new FileReader();
  reader.onloadend = () => onLoad(reader.result);
  reader.readAsDataURL(file);
};

const normalizeIdValue = (value) => {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return String(value);
};

const normalizeItemForForm = (tab, item) => {
  if (!item) {
    return EMPTY_FORM;
  }

  switch (tab) {
    case 'agents':
      return {
        name: item.name || '',
        element: item.element || '',
        factionId: normalizeIdValue(item.factionId),
        roleId: normalizeIdValue(item.roleId),
        rarityId: normalizeIdValue(item.rarityId),
        description: item.description || '',
        image: item.image || '',
      };
    case 'soundEngines':
      return {
        name: item.name || '',
        roleId: normalizeIdValue(item.roleId),
        rarityId: normalizeIdValue(item.rarityId),
        image: item.image || '',
      };
    case 'bumbos':
      return {
        name: item.name || '',
        rarityId: normalizeIdValue(item.rarityId),
        image: item.image || '',
      };
    case 'driveDisks':
      return {
        name: item.name || '',
        description: item.description || '',
        image: item.image || '',
      };
    default:
      return EMPTY_FORM;
  }
};

const preparePayload = (tab, formData) => {
  const payload = { ...formData };

  if (tab === 'agents') {
    payload.factionId = Number(payload.factionId);
    payload.roleId = Number(payload.roleId);
    payload.rarityId = Number(payload.rarityId);
  }

  if (tab === 'soundEngines') {
    payload.roleId = Number(payload.roleId);
    payload.rarityId = Number(payload.rarityId);
  }

  if (tab === 'bumbos') {
    payload.rarityId = Number(payload.rarityId);
  }

  return payload;
};

const matchesSearch = (item, query) => {
  if (!query) {
    return true;
  }

  const haystack = [
    item.name,
    item.element,
    item.faction,
    item.role,
    item.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
};

const AdminPanel = () => {
  const {
    data,
    baseData,
    baseDataDegraded,
    loading,
    refreshing,
    error,
    refreshData,
    handleAddAgent,
    handleUpdateAgent,
    handleDeleteAgent,
    handleAddSoundEngine,
    handleUpdateSoundEngine,
    handleDeleteSoundEngine,
    handleAddBumbo,
    handleUpdateBumbo,
    handleDeleteBumbo,
    handleAddDriveDisk,
    handleUpdateDriveDisk,
    handleDeleteDriveDisk,
  } = useData();

  const [activeTab, setActiveTab] = useState('agents');
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState('success');
  const [searchTerm, setSearchTerm] = useState('');
  const [editorOpen, setEditorOpen] = useState(true);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const imageInputId = `${activeTab}-image-upload`;
  const fieldId = (name) => `${activeTab}-field-${name}`;
  const fileReadSeqRef = useRef(0);

  useEffect(() => {
    fileReadSeqRef.current += 1;
    setEditingItem(null);
    setFormData(EMPTY_FORM);
    setImagePreview(null);
    setStatusMessage('');
    setSearchTerm('');
    setEditorOpen(true);
  }, [activeTab]);

  const tabConfig = useMemo(() => ({
    agents: {
      label: '代理人',
      summary: '阵营、职业和属性信息集中在同一条维护链路里。',
      items: Array.isArray(data.agents) ? data.agents : [],
      add: handleAddAgent,
      update: handleUpdateAgent,
      remove: handleDeleteAgent,
    },
    soundEngines: {
      label: '音擎',
      summary: '保留职业与稀有度关联，方便快速做配装录入。',
      items: Array.isArray(data.soundEngines) ? data.soundEngines : [],
      add: handleAddSoundEngine,
      update: handleUpdateSoundEngine,
      remove: handleDeleteSoundEngine,
    },
    bumbos: {
      label: '邦布',
      summary: '用更轻量的表格和抽屉维护邦布资料。',
      items: Array.isArray(data.bumbos) ? data.bumbos : [],
      add: handleAddBumbo,
      update: handleUpdateBumbo,
      remove: handleDeleteBumbo,
    },
    driveDisks: {
      label: '驱动盘',
      summary: '描述类条目保留更大的编辑区域和更清晰的列表预览。',
      items: Array.isArray(data.driveDisks) ? data.driveDisks : [],
      add: handleAddDriveDisk,
      update: handleUpdateDriveDisk,
      remove: handleDeleteDriveDisk,
    },
  }), [
    data.agents,
    data.bumbos,
    data.driveDisks,
    data.soundEngines,
    handleAddAgent,
    handleAddBumbo,
    handleAddDriveDisk,
    handleAddSoundEngine,
    handleDeleteAgent,
    handleDeleteBumbo,
    handleDeleteDriveDisk,
    handleDeleteSoundEngine,
    handleUpdateAgent,
    handleUpdateBumbo,
    handleUpdateDriveDisk,
    handleUpdateSoundEngine,
  ]);

  const activeConfig = tabConfig[activeTab];
  const currentItems = activeConfig.items;
  const filteredItems = useMemo(
    () => currentItems.filter((item) => matchesSearch(item, deferredSearchTerm)),
    [currentItems, deferredSearchTerm],
  );

  const hasActiveSearch = Boolean(searchTerm.trim());
  const totalCount = tabConfig.agents.items.length
    + tabConfig.soundEngines.items.length
    + tabConfig.bumbos.items.length
    + tabConfig.driveDisks.items.length;

  const metrics = [
    {
      key: 'active-tab',
      label: '当前分类',
      value: activeConfig.label,
      helper: '当前正在维护的内容模块',
      tone: 'accent',
      badge: 'LIVE',
    },
    {
      key: 'total-count',
      label: '总条目',
      value: totalCount,
      helper: `代理人 ${tabConfig.agents.items.length} · 音擎 ${tabConfig.soundEngines.items.length} · 邦布 ${tabConfig.bumbos.items.length} · 驱动盘 ${tabConfig.driveDisks.items.length}`,
      tone: 'default',
    },
    {
      key: 'filter-state',
      label: '筛选条件',
      value: hasActiveSearch ? '已筛选' : '未筛选',
      helper: hasActiveSearch ? `关键词：${searchTerm}` : '当前显示全部数据',
      tone: hasActiveSearch ? 'active' : 'muted',
      compact: true,
    },
    {
      key: 'visible-count',
      label: '当前可见',
      value: filteredItems.length,
      helper: `${activeConfig.label} 列表当前可见的记录数`,
      tone: 'default',
      badge: `${activeConfig.items.length} 原始`,
    },
  ];

  const topbarFacts = [
    { label: '模块', value: activeConfig.label },
    { label: '可见', value: `${filteredItems.length} 条` },
    { label: '搜索', value: hasActiveSearch ? '已启用' : '未启用' },
  ];

  const factionOptions = baseData?.factions || [];
  const roleOptions = baseData?.roles || [];
  const rarityOptions = baseData?.rarities || [];

  const pushStatus = (message, tone = 'success') => {
    setStatusMessage(message);
    setStatusTone(tone);
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      fileReadSeqRef.current += 1;
      setImagePreview(null);
      setStatusMessage('');
      return;
    }

    const validationResult = validateAdminImageFile(file);
    if (!validationResult.valid) {
      fileReadSeqRef.current += 1;
      setFormData((current) => ({ ...current, image: '' }));
      setImagePreview(null);
      pushStatus(validationResult.error, 'error');
      event.target.value = '';
      return;
    }

    const readSeq = ++fileReadSeqRef.current;
    buildFileReader(file, (result) => {
      if (readSeq !== fileReadSeqRef.current) {
        return;
      }
      setFormData((current) => ({ ...current, image: result }));
      setImagePreview(result);
      setStatusMessage('');
    });
  };

  const closeEditor = () => {
    fileReadSeqRef.current += 1;
    setEditingItem(null);
    setFormData(EMPTY_FORM);
    setImagePreview(null);
    setEditorOpen(false);
  };

  const openCreateEditor = () => {
    fileReadSeqRef.current += 1;
    setEditingItem(null);
    setFormData(EMPTY_FORM);
    setImagePreview(null);
    setStatusMessage('');
    setEditorOpen(true);
  };

  const handleEdit = (item) => {
    fileReadSeqRef.current += 1;
    setEditingItem(item);
    setFormData(normalizeItemForForm(activeTab, item));
    setImagePreview(item.image || null);
    setStatusMessage('');
    setEditorOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条数据吗？')) {
      return;
    }

    setSubmitting(true);
    setStatusMessage('');

    try {
      await activeConfig.remove(id);
      pushStatus(`${activeConfig.label}已删除。`);
    } catch (deleteError) {
      pushStatus(getApiErrorMessage(deleteError, '删除失败。'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logoutAdminSession();
  };

  const handleRefresh = () => {
    void refreshData().catch(() => {});
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage('');

    try {
      const payload = preparePayload(activeTab, formData);
      if (editingItem) {
        await activeConfig.update(editingItem.id, payload);
        pushStatus(`${activeConfig.label}已更新。`);
      } else {
        await activeConfig.add(payload);
        pushStatus(`${activeConfig.label}已创建。`);
      }

      setEditingItem(null);
      setFormData(EMPTY_FORM);
      setImagePreview(null);
      setEditorOpen(true);
    } catch (submitError) {
      pushStatus(getApiErrorMessage(submitError, '保存失败。'), 'error');
      setEditorOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveClick = (event) => {
    const form = event.currentTarget.closest('.admin-drawer')?.querySelector('form');
    if (form && !form.reportValidity()) {
      return;
    }
    handleSubmit(event);
  };

  const renderForm = () => {
    switch (activeTab) {
      case 'agents':
        return (
          <>
            <div className="form-group">
              <label htmlFor={fieldId('name')}>名称</label>
              <input id={fieldId('name')} name="name" value={formData.name || ''} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
              <label htmlFor={fieldId('element')}>属性</label>
              <select id={fieldId('element')} name="element" value={formData.element || ''} onChange={handleInputChange} required>
                <option value="">请选择属性</option>
                {['物理', '火', '冰', '电', '以太'].map((element) => (
                  <option key={element} value={element}>{element}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={fieldId('factionId')}>阵营</label>
              <select id={fieldId('factionId')} name="factionId" value={formData.factionId || ''} onChange={handleInputChange} required>
                <option value="">请选择阵营</option>
                {factionOptions.map((faction) => (
                  <option key={faction.id} value={faction.id}>{faction.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={fieldId('roleId')}>职业</label>
              <select id={fieldId('roleId')} name="roleId" value={formData.roleId || ''} onChange={handleInputChange} required>
                <option value="">请选择职业</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={fieldId('rarityId')}>稀有度</label>
              <select id={fieldId('rarityId')} name="rarityId" value={formData.rarityId || ''} onChange={handleInputChange} required>
                <option value="">请选择稀有度</option>
                {rarityOptions.map((rarity) => (
                  <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={fieldId('description')}>描述</label>
              <textarea
                id={fieldId('description')}
                name="description"
                value={formData.description || ''}
                onChange={handleInputChange}
                rows={4}
              />
            </div>
          </>
        );
      case 'soundEngines':
        return (
          <>
            <div className="form-group">
              <label htmlFor={fieldId('name')}>名称</label>
              <input id={fieldId('name')} name="name" value={formData.name || ''} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
              <label htmlFor={fieldId('roleId')}>职业</label>
              <select id={fieldId('roleId')} name="roleId" value={formData.roleId || ''} onChange={handleInputChange} required>
                <option value="">请选择职业</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={fieldId('rarityId')}>稀有度</label>
              <select id={fieldId('rarityId')} name="rarityId" value={formData.rarityId || ''} onChange={handleInputChange} required>
                <option value="">请选择稀有度</option>
                {rarityOptions.map((rarity) => (
                  <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
                ))}
              </select>
            </div>
          </>
        );
      case 'bumbos':
        return (
          <>
            <div className="form-group">
              <label htmlFor={fieldId('name')}>名称</label>
              <input id={fieldId('name')} name="name" value={formData.name || ''} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
              <label htmlFor={fieldId('rarityId')}>稀有度</label>
              <select id={fieldId('rarityId')} name="rarityId" value={formData.rarityId || ''} onChange={handleInputChange} required>
                <option value="">请选择稀有度</option>
                {rarityOptions.filter((item) => item.name !== 'B').map((rarity) => (
                  <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
                ))}
              </select>
            </div>
          </>
        );
      case 'driveDisks':
      default:
        return (
          <>
            <div className="form-group">
              <label htmlFor={fieldId('name')}>名称</label>
              <input id={fieldId('name')} name="name" value={formData.name || ''} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
              <label htmlFor={fieldId('description')}>描述</label>
              <textarea
                id={fieldId('description')}
                name="description"
                value={formData.description || ''}
                onChange={handleInputChange}
                rows={5}
              />
            </div>
          </>
        );
    }
  };

  const renderTableBody = () => {
    if (!filteredItems.length) {
      return (
        <div className="admin-empty-state">
          暂无符合条件的数据。
        </div>
      );
    }

    return (
      <div className="admin-table">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>信息</th>
              <th>标签</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const metaTags = [];
              if (activeTab === 'agents') {
                metaTags.push(item.faction, item.element, item.role, item.rarity);
              } else if (activeTab === 'soundEngines') {
                metaTags.push(item.role, item.rarity);
              } else if (activeTab === 'bumbos') {
                metaTags.push(item.rarity);
              } else {
                metaTags.push(item.description);
              }

              return (
                <tr key={item.id}>
                  <td>
                    <div className="admin-item-name">
                      <strong>{item.name}</strong>
                      <span>ID #{item.id}</span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-item-name">
                      <strong>{activeConfig.label}</strong>
                      <span>{item.description || activeConfig.summary}</span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-row-tags">
                      {metaTags.filter(Boolean).slice(0, 3).map((tag, tagIndex) => (
                        <span key={`${item.id}-${tag}-${tagIndex}`} className="admin-badge">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" className="btn-edit" onClick={() => handleEdit(item)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn-delete"
                        onClick={() => handleDelete(item.id)}
                        disabled={submitting}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className={`admin-shell theme-zzz-admin${refreshing ? ' is-refreshing' : ''}`}>
      <aside className="admin-sidebar">
        <Link to="/zzz-wiki" className="admin-sidebar-brand">
          <h2>HengZZZ</h2>
          <p>Pixso 风格后台已映射到现有管理员工作流。</p>
        </Link>

        <nav className="admin-sidebar-nav">
          {Object.entries(tabConfig).map(([key, config]) => (
            <button
              key={key}
              type="button"
              className={`admin-sidebar-link ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
              disabled={submitting}
            >
              <strong>{config.label}</strong>
              <span>{config.summary}</span>
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <p>当前工作流直接写入数据库，并自动刷新公开快照。</p>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-title">
            <p className="wiki-kicker">Zenless Zone Zero Admin</p>
            <h1>ZZZ 管理面板</h1>
            <p>当前维护：{activeConfig.label}</p>
            <div className="admin-topbar-meta">
              {topbarFacts.map((fact) => (
                <span key={fact.label} className="admin-topbar-chip">
                  <strong>{fact.label}</strong>
                  <span>{fact.value}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="admin-actions">
            <button type="button" className="admin-action secondary" onClick={handleRefresh}>
              刷新数据
            </button>
            <button type="button" className="admin-action secondary" onClick={handleLogout}>
              退出登录
            </button>
            <button type="button" className="admin-action primary" onClick={openCreateEditor}>
              新增 {activeConfig.label}
            </button>
          </div>
        </header>

        {statusMessage ? (
          <div className={`status-banner${statusTone === 'error' ? ' error' : ''}`}>
            {statusMessage}
          </div>
        ) : null}
        {error ? <div className="status-banner error">{error}</div> : null}
        {!error && baseDataDegraded ? (
          <div className="status-banner error" role="alert">
            部分基础数据加载失败，下拉选项可能不完整。
            <button type="button" className="wiki-error-retry" onClick={handleRefresh}>
              重试
            </button>
          </div>
        ) : null}

        <section className="admin-metric-grid">
          {metrics.map((metric) => (
            <article
              key={metric.key}
              className="admin-metric-card"
              data-tone={metric.tone}
            >
              <div className="admin-metric-head">
                <span className="admin-metric-label">{metric.label}</span>
                {metric.badge ? <span className="admin-metric-badge">{metric.badge}</span> : null}
              </div>
              <strong className={`admin-metric-value ${metric.compact ? 'is-compact' : ''}`}>
                {metric.value}
              </strong>
              <p className="admin-metric-copy">{metric.helper}</p>
            </article>
          ))}
        </section>

        <section className="admin-surface">
          <div className="admin-surface-header">
            <div className="admin-surface-title">
              <h3>{activeConfig.label} 列表</h3>
              <p>当前共 {filteredItems.length} 条可见数据。</p>
            </div>
            <div className="admin-surface-tools">
              <div className="admin-toolbar-stat">
                {hasActiveSearch ? `已匹配 ${filteredItems.length} 条` : `显示全部 ${filteredItems.length} 条`}
              </div>
              <div className="admin-search-wrap">
                <input
                  className="admin-search-input"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={`搜索${activeConfig.label}...`}
                  aria-label={`搜索${activeConfig.label}`}
                />
              </div>
            </div>
          </div>
          {renderTableBody()}
        </section>
      </main>

      {editorOpen ? (
        <>
          <button type="button" className="admin-drawer-backdrop" onClick={closeEditor} aria-label="关闭编辑器" />
          <aside className="admin-drawer">
            <div className="admin-drawer-header">
              <div>
                <h3>{editingItem ? `编辑${activeConfig.label}` : `新增${activeConfig.label}`}</h3>
                <p>{editingItem ? '修改现有内容并同步公开数据。' : '创建后会自动刷新公开快照。'}</p>
              </div>
              <button type="button" className="btn-secondary" onClick={closeEditor}>
                关闭
              </button>
            </div>

            <div className="admin-drawer-body">
              <form onSubmit={handleSubmit} className="admin-form">
                {renderForm()}
                <div className="form-group">
                  <label htmlFor={imageInputId}>图片</label>
                  <div className="image-dropzone">
                    <input id={imageInputId} type="file" accept="image/*" onChange={handleFileChange} />
                    {imagePreview ? <img src={imagePreview} alt="预览" className="image-preview" /> : null}
                  </div>
                  <input type="hidden" name="image" value={formData.image || ''} />
                </div>
              </form>
            </div>

            <div className="admin-drawer-footer">
              <p>{activeConfig.summary}</p>
              <div className="form-actions">
                {editingItem ? (
                  <button type="button" className="btn-secondary" onClick={openCreateEditor}>
                    切换到新增
                  </button>
                ) : null}
                <button type="button" className="btn-primary" onClick={handleSaveClick} disabled={submitting}>
                  {submitting ? '保存中...' : (editingItem ? '保存修改' : '新增')}
                </button>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
};

export default memo(AdminPanel);
