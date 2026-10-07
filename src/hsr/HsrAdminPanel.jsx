import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import { useData } from '../DataContext.jsx';
import logoutAdminSession from '../utils/adminLogout.js';
import { getApiErrorMessage } from '../utils/apiError.js';
import { validateAdminImageFile } from '../utils/imageUpload.js';
import '../ZZZWiki.css';

const star = '/assets/star.jpg';

const EMPTY_FORM = {};

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

  if (tab === 'hsrCharacters') {
    return {
      name: item.name || '',
      elementId: normalizeIdValue(item.elementId),
      pathId: normalizeIdValue(item.pathId),
      rarityId: normalizeIdValue(item.rarityId),
      description: item.description || '',
      image: item.image || '',
    };
  }

  if (tab === 'hsrCones') {
    return {
      name: item.name || '',
      pathId: normalizeIdValue(item.pathId),
      rarityId: normalizeIdValue(item.rarityId),
      image: item.image || '',
    };
  }

  return {
    name: item.name || '',
    typeId: normalizeIdValue(item.typeId),
    setName: item.setName || '',
    part: item.part || '',
    image: item.image || '',
  };
};

const preparePayload = (tab, formData) => {
  if (tab === 'hsrCharacters') {
    return {
      ...formData,
      elementId: Number(formData.elementId),
      pathId: Number(formData.pathId),
      rarityId: Number(formData.rarityId),
    };
  }

  if (tab === 'hsrCones') {
    return {
      ...formData,
      pathId: Number(formData.pathId),
      rarityId: Number(formData.rarityId),
    };
  }

  return {
    ...formData,
    typeId: Number(formData.typeId),
  };
};

const readFileAsDataUrl = (file, onLoad) => {
  const reader = new FileReader();
  reader.onloadend = () => onLoad(reader.result);
  reader.readAsDataURL(file);
};

const matchesSearch = (item, query) => {
  if (!query) {
    return true;
  }

  const haystack = [
    item.name,
    item.element,
    item.path,
    item.type,
    item.setName,
    item.part,
    item.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
};

const HsrAdminPanel = () => {
  const {
    data,
    baseData,
    baseDataDegraded,
    loading,
    refreshing,
    error,
    refreshData,
    handleAddHsrCharacter,
    handleUpdateHsrCharacter,
    handleDeleteHsrCharacter,
    handleAddHsrCone,
    handleUpdateHsrCone,
    handleDeleteHsrCone,
    handleAddHsrRelic,
    handleUpdateHsrRelic,
    handleDeleteHsrRelic,
  } = useData();

  const [activeTab, setActiveTab] = useState('hsrCharacters');
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

  const pushStatus = (message, tone = 'success') => {
    setStatusMessage(message);
    setStatusTone(tone);
  };

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
    hsrCharacters: {
      label: '角色',
      summary: '角色录入保留元素、命途和稀有度映射。',
      items: Array.isArray(data.hsrCharacters) ? data.hsrCharacters : [],
      add: handleAddHsrCharacter,
      update: handleUpdateHsrCharacter,
      remove: handleDeleteHsrCharacter,
    },
    hsrCones: {
      label: '光锥',
      summary: '光锥维护延续命途和稀有度字段，便于分页展示。',
      items: Array.isArray(data.hsrCones) ? data.hsrCones : [],
      add: handleAddHsrCone,
      update: handleUpdateHsrCone,
      remove: handleDeleteHsrCone,
    },
    hsrRelics: {
      label: '遗器',
      summary: '遗器按类型、套装和部位维护，信息展示更适合表格浏览。',
      items: Array.isArray(data.hsrRelics) ? data.hsrRelics : [],
      add: handleAddHsrRelic,
      update: handleUpdateHsrRelic,
      remove: handleDeleteHsrRelic,
    },
  }), [
    data.hsrCharacters,
    data.hsrCones,
    data.hsrRelics,
    handleAddHsrCharacter,
    handleAddHsrCone,
    handleAddHsrRelic,
    handleDeleteHsrCharacter,
    handleDeleteHsrCone,
    handleDeleteHsrRelic,
    handleUpdateHsrCharacter,
    handleUpdateHsrCone,
    handleUpdateHsrRelic,
  ]);

  const activeConfig = tabConfig[activeTab];
  const filteredItems = useMemo(
    () => activeConfig.items.filter((item) => matchesSearch(item, deferredSearchTerm)),
    [activeConfig.items, deferredSearchTerm],
  );

  const hsrBase = baseData?.hsr || {
    elements: [],
    paths: [],
    rarities: [],
    relicTypes: [],
    relicParts: [],
  };

  const hasActiveSearch = Boolean(searchTerm.trim());
  const totalCount = tabConfig.hsrCharacters.items.length
    + tabConfig.hsrCones.items.length
    + tabConfig.hsrRelics.items.length;

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
      helper: `角色 ${tabConfig.hsrCharacters.items.length} · 光锥 ${tabConfig.hsrCones.items.length} · 遗器 ${tabConfig.hsrRelics.items.length}`,
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
    readFileAsDataUrl(file, (result) => {
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
    if (activeTab === 'hsrCharacters') {
      return (
        <>
          <div className="form-group">
            <label htmlFor={fieldId('name')}>名称</label>
            <input id={fieldId('name')} name="name" value={formData.name || ''} onChange={handleInputChange} required />
          </div>
          <div className="form-group">
            <label htmlFor={fieldId('elementId')}>元素</label>
            <select id={fieldId('elementId')} name="elementId" value={formData.elementId || ''} onChange={handleInputChange} required>
              <option value="">请选择元素</option>
              {hsrBase.elements.map((element) => (
                <option key={element.id} value={element.id}>{element.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor={fieldId('pathId')}>命途</label>
            <select id={fieldId('pathId')} name="pathId" value={formData.pathId || ''} onChange={handleInputChange} required>
              <option value="">请选择命途</option>
              {hsrBase.paths.map((path) => (
                <option key={path.id} value={path.id}>{path.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor={fieldId('rarityId')}>稀有度</label>
            <select id={fieldId('rarityId')} name="rarityId" value={formData.rarityId || ''} onChange={handleInputChange} required>
              <option value="">请选择稀有度</option>
              {hsrBase.rarities.map((rarity) => (
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
    }

    if (activeTab === 'hsrCones') {
      return (
        <>
          <div className="form-group">
            <label htmlFor={fieldId('name')}>名称</label>
            <input id={fieldId('name')} name="name" value={formData.name || ''} onChange={handleInputChange} required />
          </div>
          <div className="form-group">
            <label htmlFor={fieldId('pathId')}>命途</label>
            <select id={fieldId('pathId')} name="pathId" value={formData.pathId || ''} onChange={handleInputChange} required>
              <option value="">请选择命途</option>
              {hsrBase.paths.map((path) => (
                <option key={path.id} value={path.id}>{path.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor={fieldId('rarityId')}>稀有度</label>
            <select id={fieldId('rarityId')} name="rarityId" value={formData.rarityId || ''} onChange={handleInputChange} required>
              <option value="">请选择稀有度</option>
              {hsrBase.rarities.map((rarity) => (
                <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
              ))}
            </select>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="form-group">
          <label htmlFor={fieldId('name')}>名称</label>
          <input id={fieldId('name')} name="name" value={formData.name || ''} onChange={handleInputChange} required />
        </div>
        <div className="form-group">
          <label htmlFor={fieldId('typeId')}>类型</label>
          <select id={fieldId('typeId')} name="typeId" value={formData.typeId || ''} onChange={handleInputChange} required>
            <option value="">请选择类型</option>
            {hsrBase.relicTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={fieldId('setName')}>套装名称</label>
          <input id={fieldId('setName')} name="setName" value={formData.setName || ''} onChange={handleInputChange} />
        </div>
        <div className="form-group">
          <label htmlFor={fieldId('part')}>部位</label>
          <select id={fieldId('part')} name="part" value={formData.part || ''} onChange={handleInputChange}>
            <option value="">请选择部位</option>
            {hsrBase.relicParts.map((part) => (
              <option key={part} value={part}>{part}</option>
            ))}
          </select>
        </div>
      </>
    );
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
              if (activeTab === 'hsrCharacters') {
                metaTags.push(item.element, item.path, item.rarity);
              } else if (activeTab === 'hsrCones') {
                metaTags.push(item.path, item.rarity);
              } else {
                metaTags.push(item.type, item.setName, item.part);
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
                      <span>{activeConfig.summary}</span>
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
    <div className={`admin-shell theme-hsr-admin${refreshing ? ' is-refreshing' : ''}`}>
      <aside className="admin-sidebar">
        <Link to="/hsr-wiki" className="admin-sidebar-brand">
          <h2>HengHSR</h2>
          <p>保留现有 HSR 内容录入链路，同时切到新的后台视觉系统。</p>
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
          <p>当前工作流直接写数据库并同步公开页，无需额外手动发布。</p>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-title">
            <p className="wiki-kicker">Honkai: Star Rail Admin</p>
            <h1>HSR 管理面板</h1>
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
                <p>{editingItem ? '修改现有内容并立即同步公开展示。' : '创建后会自动刷新公开数据。'}</p>
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
                    {!imagePreview ? <img src={star} alt="HSR 默认预览" className="image-preview" /> : null}
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

export default memo(HsrAdminPanel);
