import { memo, startTransition, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import star from '../assets/star.jpg';
import PaginationControls from '../components/PaginationControls.jsx';
import { useData } from '../DataContext.jsx';
import usePaginatedPublicList from '../hooks/usePaginatedPublicList.js';
import { buildHsrListRequest } from '../utils/publicFilterParams.js';
import '../ZZZWiki.css';

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
  const image = item.image;
  if (image && (image.startsWith('data:') || image.startsWith('/'))) {
    return image;
  }

  return image || fallback;
};

const characterImage = withFallbackImage(star);
const coneImage = withFallbackImage(star);
const relicImage = withFallbackImage(star);

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
    loading: contextLoading,
    error: contextError,
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

  const loading = contextLoading || listState.loading;
  const error = listState.error || contextError;
  const hsr = baseData?.hsr || {
    elements: [],
    paths: [],
    rarities: [],
    relicTypes: [],
    relicParts: [],
  };

  const selectedFilterCount = countSelectedFilters(filters[activeTab]);
  const heroStats = [
    {
      label: '当前分类',
      value: TAB_CONFIG[activeTab].title,
      detail: '当前展示资料类型',
      accent: 'blue',
      kind: 'category',
    },
    {
      label: '总条目',
      value: listState.total,
      detail: `当前分类共 ${listState.total} 条`,
      accent: 'plain',
      kind: 'number',
    },
    {
      label: '筛选条件',
      value: selectedFilterCount ? `${selectedFilterCount} 项生效` : '显示全部',
      detail: selectedFilterCount ? '结果范围已缩小' : '显示全部结果',
      status: selectedFilterCount ? '已筛选' : '未筛选',
      accent: 'plain',
      kind: 'filter',
    },
  ];

  const handleFilterChange = (tab, type, values) => {
    setFilters((current) => ({
      ...current,
      [tab]: {
        ...current[tab],
        [type]: values,
      },
    }));
  };

  const renderFilters = () => {
    if (activeTab === 'hsrCharacters') {
      return (
        <div className="filter-container">
          <DynamicFilterGroup
            title="元素"
            values={filters.hsrCharacters.element}
            options={normalizeArray(hsr.elements).map((item) => ({
              label: item.name,
              value: item.name,
            }))}
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
            options={normalizeArray(hsr.paths).map((item) => ({
              label: item.name,
              value: item.name,
            }))}
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
            options={normalizeArray(hsr.rarities).map((item) => ({
              label: item.name,
              value: item.name,
            }))}
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
            options={normalizeArray(hsr.paths).map((item) => ({
              label: item.name,
              value: item.name,
            }))}
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
            options={normalizeArray(hsr.rarities).map((item) => ({
              label: item.name,
              value: item.name,
            }))}
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
          options={normalizeArray(hsr.relicTypes).map((item) => ({
            label: item.name,
            value: item.name,
          }))}
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
          options={normalizeArray(hsr.relicParts).map((item) => ({
            label: item,
            value: item,
          }))}
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
              onError={(event) => {
                event.currentTarget.src = star;
              }}
            />
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{item.name}</h3>
              <span className="rarity-badge" data-rarity={item.rarity}>
                {item.rarity}
              </span>
            </div>
            <p>元素、命途和稀有度信息在列表里直接完成首轮筛选。</p>
            <div className="wiki-card-tags">
              <span className="role-tag">{item.element}</span>
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
              onError={(event) => {
                event.currentTarget.src = star;
              }}
            />
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{item.name}</h3>
              <span className="rarity-badge" data-rarity={item.rarity}>
                {item.rarity}
              </span>
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
            onError={(event) => {
              event.currentTarget.src = star;
            }}
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

  if (loading) {
    return (
      <div className="wiki-shell theme-hsr">
        <div className="wiki-status-panel">
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wiki-shell theme-hsr">
        <div className="wiki-status-panel">
          <p>加载失败：{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wiki-shell theme-hsr">
      <div className="wiki-backdrop" />
      <div className="wiki-frame">
        <header className="wiki-topbar">
          <Link to="/" className="wiki-brand">HengBeGer</Link>
          <div className="wiki-topbar-actions">
            <Link to="/zzz-wiki" className="ghost-action">切到 ZZZ</Link>
            <Link to="/hsr-wiki/admin" className="solid-action">内容后台</Link>
          </div>
        </header>

        <section className="wiki-hero">
          <div className="wiki-hero-copy">
            <p className="wiki-kicker">Honkai: Star Rail Archive</p>
            <h1>HengHSR</h1>
            <p className="wiki-description">{TAB_CONFIG[activeTab].heroCopy}</p>
          </div>
          <div className="wiki-stat-grid">
            {heroStats.map((item) => (
              <article
                key={item.label}
                className="wiki-stat-card"
                data-accent={item.accent}
                data-kind={item.kind}
              >
                <span className="wiki-stat-label">{item.label}</span>
                {item.status ? (
                  <span className="wiki-stat-pill">{item.status}</span>
                ) : null}
                <strong>{item.value}</strong>
                <p className="wiki-stat-detail">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

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
          <p className="wiki-toolbar-copy">
            当前页共 {listState.total} 条，支持分页浏览与条件组合。
          </p>
        </section>

        <section className="wiki-surface">
          {renderFilters()}
        </section>

        <section className="wiki-grid">
          {renderCards()}
        </section>

        <PaginationControls
          page={listState.page}
          totalPages={listState.totalPages}
          total={listState.total}
          canPrev={listState.canPrev}
          canNext={listState.canNext}
          disabled={listState.loading}
          onPrev={listState.prevPage}
          onNext={listState.nextPage}
        />
      </div>
    </div>
  );
};

export default memo(HsrWiki);
