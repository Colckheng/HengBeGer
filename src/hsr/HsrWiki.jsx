import { memo, startTransition, useMemo, useState } from 'react';

import LoadErrorBanner from '../components/LoadErrorBanner.jsx';
import PaginationControls from '../components/PaginationControls.jsx';
import { useData } from '../DataContext.jsx';
import usePaginatedPublicList from '../hooks/usePaginatedPublicList.js';
import { buildHsrListRequest } from '../utils/publicFilterParams.js';
import '../ZZZWiki.css';

const star = '/assets/star.jpg';

const TAB_CONFIG = {
  hsrCharacters: {
    title: '角色',
    endpoint: '/hsr/characters/list',
    heroCopy: '元素、命途和稀有度筛选被压到更紧凑的浏览界面里。',
    emptyMessage: '暂无角色数据。',
  },
  hsrCones: {
    title: '光锥',
    endpoint: '/hsr/cones/list',
    heroCopy: '更适合搭配角色检索的光锥目录，保留分页与筛选能力。',
    emptyMessage: '暂无光锥数据。',
  },
  hsrRelics: {
    title: '遗器',
    endpoint: '/hsr/relics/list',
    heroCopy: '遗器按类型与部位浏览，保留现有查询逻辑并强化视觉层次。',
    emptyMessage: '暂无遗器数据。',
  },
};

const DEFAULT_FILTERS = {
  hsrCharacters: { element: [], path: [], rarity: [] },
  hsrCones: { path: [], rarity: [] },
  hsrRelics: { type: [], part: [] },
};

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const nameOptions = (list) => {
  const names = normalizeArray(list)
    .map((item) => (item && typeof item.name === 'string' ? item.name : ''))
    .filter(Boolean);
  return [...new Set(names)].map((name) => ({ label: name, value: name }));
};

const toggleValue = (values = [], candidate) => (
  values.includes(candidate)
    ? values.filter((value) => value !== candidate)
    : [...values, candidate]
);

const countSelectedFilters = (filters = {}) => (
  Object.values(filters).reduce((count, value) => (
    count + (Array.isArray(value) ? value.length : 0)
  ), 0)
);

const withFallbackImage = (fallback) => (item) => {
  const image = typeof item.image === 'string' ? item.image : '';
  if (image && (image.startsWith('data:') || image.startsWith('/'))) {
    return image;
  }

  return image || fallback;
};

const characterImage = withFallbackImage(star);
const coneImage = withFallbackImage(star);
const relicImage = withFallbackImage(star);

const handleImageError = (event) => {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied === '1') {
    return;
  }
  img.dataset.fallbackApplied = '1';
  img.src = star;
};

const DynamicFilterGroup = ({
  title,
  values = [],
  options,
  onReset,
  onToggle,
}) => (
  <div className="filter-group">
    <h3>{title}</h3>
    <div className="filter-options filter-options-wrap">
      <button
        type="button"
        className={!values.length ? 'active' : ''}
        onClick={onReset}
      >
        全部
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={values.includes(option.value) ? 'active' : ''}
          onClick={() => onToggle(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const HsrWiki = () => {
  const {
    baseData,
    baseDataDegraded,
    loading: contextLoading,
    error: contextError,
    refreshData,
  } = useData();
  const [activeTab, setActiveTab] = useState('hsrCharacters');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const requestFilters = useMemo(
    () => buildHsrListRequest(activeTab, filters[activeTab], baseData),
    [activeTab, baseData, filters],
  );

  const listState = usePaginatedPublicList({
    endpoint: TAB_CONFIG[activeTab].endpoint,
    filters: requestFilters,
    resetKey: activeTab,
    fallbackError: '加载列表失败。',
  });

  const initialLoading = contextLoading
    || (listState.loading && listState.items.length === 0);
  const refreshing = !initialLoading && listState.loading;
  const error = listState.error || contextError;
  const hsr = baseData?.hsr || {
    elements: [],
    paths: [],
    rarities: [],
    relicTypes: [],
    relicParts: [],
  };

  const selectedFilterCount = countSelectedFilters(filters[activeTab]);

  const handleFilterChange = (tab, type, values) => {
    setFilters((current) => ({
      ...current,
      [tab]: {
        ...current[tab],
        [type]: values,
      },
    }));
  };

  const handleRetry = () => {
    if (listState.error) {
      listState.retry();
    }
    if (contextError) {
      void refreshData().catch(() => {});
    }
  };

  const renderFilters = () => {
    if (activeTab === 'hsrCharacters') {
      return (
        <div className="filter-container">
          <DynamicFilterGroup
            title="元素"
            values={filters.hsrCharacters.element}
            options={nameOptions(hsr.elements)}
            onReset={() => handleFilterChange('hsrCharacters', 'element', [])}
            onToggle={(option) => handleFilterChange(
              'hsrCharacters',
              'element',
              toggleValue(filters.hsrCharacters.element, option),
            )}
          />
          <DynamicFilterGroup
            title="命途"
            values={filters.hsrCharacters.path}
            options={nameOptions(hsr.paths)}
            onReset={() => handleFilterChange('hsrCharacters', 'path', [])}
            onToggle={(option) => handleFilterChange(
              'hsrCharacters',
              'path',
              toggleValue(filters.hsrCharacters.path, option),
            )}
          />
          <DynamicFilterGroup
            title="稀有度"
            values={filters.hsrCharacters.rarity}
            options={nameOptions(hsr.rarities)}
            onReset={() => handleFilterChange('hsrCharacters', 'rarity', [])}
            onToggle={(option) => handleFilterChange(
              'hsrCharacters',
              'rarity',
              toggleValue(filters.hsrCharacters.rarity, option),
            )}
          />
        </div>
      );
    }

    if (activeTab === 'hsrCones') {
      return (
        <div className="filter-container">
          <DynamicFilterGroup
            title="命途"
            values={filters.hsrCones.path}
            options={nameOptions(hsr.paths)}
            onReset={() => handleFilterChange('hsrCones', 'path', [])}
            onToggle={(option) => handleFilterChange(
              'hsrCones',
              'path',
              toggleValue(filters.hsrCones.path, option),
            )}
          />
          <DynamicFilterGroup
            title="稀有度"
            values={filters.hsrCones.rarity}
            options={nameOptions(hsr.rarities)}
            onReset={() => handleFilterChange('hsrCones', 'rarity', [])}
            onToggle={(option) => handleFilterChange(
              'hsrCones',
              'rarity',
              toggleValue(filters.hsrCones.rarity, option),
            )}
          />
        </div>
      );
    }

    return (
      <div className="filter-container">
        <DynamicFilterGroup
          title="类型"
          values={filters.hsrRelics.type}
          options={nameOptions(hsr.relicTypes)}
          onReset={() => handleFilterChange('hsrRelics', 'type', [])}
          onToggle={(option) => handleFilterChange(
            'hsrRelics',
            'type',
            toggleValue(filters.hsrRelics.type, option),
          )}
        />
        <DynamicFilterGroup
          title="部位"
          values={filters.hsrRelics.part}
          options={nameOptions(hsr.relicParts)}
          onReset={() => handleFilterChange('hsrRelics', 'part', [])}
          onToggle={(option) => handleFilterChange(
            'hsrRelics',
            'part',
            toggleValue(filters.hsrRelics.part, option),
          )}
        />
      </div>
    );
  };

  const renderCards = () => {
    if (listState.items.length === 0) {
      return (
        <div className="wiki-status-panel">
          <p>{TAB_CONFIG[activeTab].emptyMessage}</p>
        </div>
      );
    }

    if (activeTab === 'hsrCharacters') {
      return listState.items.map((item) => (
        <article key={item.id} className="wiki-card">
          <div className="wiki-card-image">
            <img
              src={characterImage(item)}
              alt={item.name}
              onError={handleImageError}
            />
            <span className="rarity-badge" data-rarity={item.rarity}>
              {item.rarity}
            </span>
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{item.name}</h3>
            </div>
            <p>元素、命途和稀有度信息在列表里直接完成首轮筛选。</p>
            <div className="wiki-card-tags">
              <span className="role-tag" data-el={item.element}>{item.element}</span>
              <span className="role-tag">{item.path}</span>
            </div>
          </div>
        </article>
      ));
    }

    if (activeTab === 'hsrCones') {
      return listState.items.map((item) => (
        <article key={item.id} className="wiki-card">
          <div className="wiki-card-image">
            <img
              src={coneImage(item)}
              alt={item.name}
              onError={handleImageError}
            />
            <span className="rarity-badge" data-rarity={item.rarity}>
              {item.rarity}
            </span>
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{item.name}</h3>
            </div>
            <p>按照命途和稀有度快速定位目标光锥。</p>
            <div className="wiki-card-tags">
              <span className="role-tag">{item.path}</span>
            </div>
          </div>
        </article>
      ));
    }

    return listState.items.map((item) => (
      <article key={item.id} className="wiki-card">
        <div className="wiki-card-image">
          <img
            src={relicImage(item)}
            alt={item.name}
            onError={handleImageError}
          />
        </div>
        <div className="wiki-card-body">
          <div className="wiki-card-heading">
            <h3>{item.name}</h3>
          </div>
          <p>把套装、类型和部位信息压到更适合扫读的卡片结构里。</p>
          <div className="wiki-card-tags">
            <span className="role-tag">{item.type}</span>
            {item.setName ? <span className="role-tag">{item.setName}</span> : null}
            {item.part ? <span className="role-tag">{item.part}</span> : null}
          </div>
        </div>
      </article>
    ));
  };

  if (initialLoading) {
    return (
      <div className="wiki-shell theme-hsr">
        <div className="wiki-status-panel">
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error && initialLoading) {
    return (
      <div className="wiki-shell theme-hsr">
        <div className="wiki-status-panel">
          <p>加载失败：{error}</p>
          <button type="button" className="wiki-error-retry" onClick={handleRetry}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wiki-shell theme-hsr">
      <div className="wiki-backdrop" />
      <div className="wiki-frame">
        {error && <LoadErrorBanner message={error} onRetry={handleRetry} />}
        {!error && baseDataDegraded && (
          <LoadErrorBanner
            message="部分基础数据加载失败，筛选选项可能不完整。"
            onRetry={handleRetry}
          />
        )}
        <section className="wiki-head">
          <div className="wiki-head-left">
            <h1>{TAB_CONFIG[activeTab].title}</h1>
            <span className="wiki-kicker">Honkai: Star Rail Archive</span>
          </div>
          <div className="wiki-head-right">
            <span>
              共 {listState.total} 条 · 第 {listState.page} / {listState.totalPages} 页
            </span>
            <PaginationControls
              totalPages={listState.totalPages}
              canPrev={listState.canPrev}
              canNext={listState.canNext}
              disabled={listState.loading}
              onPrev={listState.prevPage}
              onNext={listState.nextPage}
            />
          </div>
        </section>
        <p className="wiki-subtitle">{TAB_CONFIG[activeTab].heroCopy}</p>

        <section className="wiki-toolbar">
          <div className="wiki-chip-nav">
            {Object.entries(TAB_CONFIG).map(([tabKey, config]) => (
              <button
                key={tabKey}
                type="button"
                className={`wiki-chip ${activeTab === tabKey ? 'active' : ''}`}
                onClick={() => {
                  startTransition(() => {
                    setActiveTab(tabKey);
                  });
                }}
              >
                {config.title}
              </button>
            ))}
          </div>
        </section>

        <section className="wiki-surface">
          {renderFilters()}
        </section>

        <p className="wiki-result-line">
          <span>
            {selectedFilterCount
              ? `已筛选 ${selectedFilterCount} 项 · 当前页共 ${listState.total} 条`
              : `当前页共 ${listState.total} 条，显示全部结果`}
          </span>
          <span>支持分页与多维筛选</span>
        </p>

        <section
          className={`wiki-grid${refreshing ? ' is-refreshing' : ''}`}
          aria-busy={refreshing}
        >
          {renderCards()}
        </section>
      </div>
    </div>
  );
};

export default memo(HsrWiki);
