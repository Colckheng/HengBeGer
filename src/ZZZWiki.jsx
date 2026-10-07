import {
  memo,
  startTransition,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import LoadErrorBanner from './components/LoadErrorBanner.jsx';
import PaginationControls from './components/PaginationControls.jsx';
import { useData } from './DataContext.jsx';
import Filter from './Filter.jsx';
import usePaginatedPublicList from './hooks/usePaginatedPublicList.js';
import { buildZzzListRequest } from './utils/publicFilterParams.js';
import './ZZZWiki.css';

const zzz = '/assets/zzz.jpg';

const DEFAULT_FILTERS = {
  agents: { role: [], element: [], faction: [] },
  soundEngines: { role: [], rarity: [] },
  bumbos: { rarity: [] },
  driveDisks: {},
};

const TAB_CONFIG = {
  agents: {
    title: '代理人',
    endpoint: '/agents/list',
    heroCopy: '阵营、属性与职业信息被收拢到一套更适合浏览的角色资料页里。',
    emptyMessage: '暂无代理人数据。',
  },
  soundEngines: {
    title: '音擎',
    endpoint: '/sound-engines/list',
    heroCopy: '把职业和稀有度信息拉到前台，方便快速找到当前配装目标。',
    emptyMessage: '暂无音擎数据。',
  },
  bumbos: {
    title: '邦布',
    endpoint: '/bumbos/list',
    heroCopy: '用更轻更快的卡片浏览方式查看邦布资料与稀有度。',
    emptyMessage: '暂无邦布数据。',
  },
  driveDisks: {
    title: '驱动盘',
    endpoint: '/drive-disks/list',
    heroCopy: '驱动盘资料保留说明字段，同时转成更像目录页的视觉样式。',
    emptyMessage: '暂无驱动盘数据。',
  },
};

const rarityBadge = (rarity) => {
  switch (rarity) {
    case 'SSR':
    case 'S':
      return 'S';
    case 'SR':
    case 'A':
      return 'A';
    default:
      return 'B';
  }
};

const normalizeImage = (fallback) => (item) => {
  const image = typeof item.image === 'string' ? item.image : '';
  if (image && (image.startsWith('data:') || image.startsWith('/'))) {
    return image;
  }

  return image || fallback;
};

const handleImageError = (event) => {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied === '1') {
    return;
  }
  img.dataset.fallbackApplied = '1';
  img.src = zzz;
};

const agentImage = normalizeImage(zzz);
const engineImage = normalizeImage(zzz);
const bumboImage = normalizeImage(zzz);
const diskImage = normalizeImage(zzz);

const countSelectedFilters = (filters = {}) => (
  Object.values(filters).reduce((count, value) => {
    if (!Array.isArray(value)) {
      return count;
    }

    return count + value.length;
  }, 0)
);

const optionNames = (list = []) => (
  [...new Set(list.map((item) => item && item.name).filter(Boolean))]
);

const AgentDetail = ({ agent }) => {
  if (!agent) {
    return (
      <div className="wiki-status-panel">
        <p>未找到该代理人。</p>
      </div>
    );
  }

  return (
    <section className="detail-shell">
      <div className="detail-surface">
        <div className="detail-media">
          <img
            src={agentImage(agent)}
            alt={agent.name}
            onError={handleImageError}
          />
        </div>
        <div className="detail-body">
          <p className="wiki-kicker">Zenless Zone Zero Agent File</p>
          <h1>{agent.name}</h1>
          <div className="detail-meta">
            <span className="rarity-badge" data-rarity={rarityBadge(agent.rarity || agent.Rarity?.name)}>
              {rarityBadge(agent.rarity || agent.Rarity?.name)}
            </span>
            <span className="role-tag">{agent.role || agent.Role?.name || '未知职业'}</span>
            <span className="role-tag">{agent.faction || agent.Faction?.name || '未知阵营'}</span>
            <span className="role-tag">{agent.element || agent.Element?.name || '未知属性'}</span>
          </div>
          <p className="detail-description">
            {agent.description || '当前条目暂未填写详细描述。'}
          </p>
        </div>
      </div>
    </section>
  );
};

const ZZZWiki = ({ mode = 'list', agentId = null }) => {
  const {
    data,
    baseData,
    baseDataDegraded,
    loading: contextLoading,
    error: contextError,
    refreshData,
  } = useData();
  const [activeTab, setActiveTab] = useState('agents');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  useEffect(() => {
    if (mode === 'detail' && agentId) {
      const agent = Array.isArray(data.agents)
        ? data.agents.find((item) => item.id === Number(agentId))
        : null;
      setSelectedAgent(agent || null);
    }
  }, [agentId, data.agents, mode]);

  const requestFilters = useMemo(
    () => buildZzzListRequest(activeTab, filters[activeTab], baseData),
    [activeTab, baseData, filters],
  );

  const optionLists = useMemo(() => ({
    roles: optionNames(baseData.roles),
    factions: optionNames(baseData.factions),
    rarities: optionNames(baseData.rarities),
  }), [baseData]);

  const listState = usePaginatedPublicList({
    endpoint: TAB_CONFIG[activeTab].endpoint,
    filters: requestFilters,
    enabled: mode !== 'detail',
    resetKey: activeTab,
    fallbackError: '加载列表失败。',
  });

  const initialLoading = contextLoading
    || (mode !== 'detail' && listState.loading && listState.items.length === 0);
  const refreshing = mode !== 'detail' && !initialLoading && listState.loading;
  const error = mode === 'detail' ? contextError : listState.error || contextError;
  const selectedFilterCount = countSelectedFilters(filters[activeTab]);

  const handleFilterChange = (tab, filterType, value) => {
    setFilters((current) => ({
      ...current,
      [tab]: {
        ...current[tab],
        [filterType]: value,
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

  const renderCards = () => {
    if (listState.items.length === 0) {
      return (
        <div className="wiki-status-panel">
          <p>{TAB_CONFIG[activeTab].emptyMessage}</p>
        </div>
      );
    }

    if (activeTab === 'agents') {
      return listState.items.map((agent) => (
        <Link
          key={agent.id}
          className="wiki-card is-clickable"
          to={`/zzz-wiki/agent/${agent.id}`}
        >
          <div className="wiki-card-image">
            <img
              src={agentImage(agent)}
              alt={agent.name}
              onError={handleImageError}
            />
            <span className="rarity-badge" data-rarity={rarityBadge(agent.rarity || agent.Rarity?.name)}>
              {rarityBadge(agent.rarity || agent.Rarity?.name)}
            </span>
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{agent.name}</h3>
              <span className="wiki-card-chev" aria-hidden="true">›</span>
            </div>
            <p>{agent.role || agent.Role?.name || '未知职业'}</p>
            <div className="wiki-card-tags">
              <span className="role-tag">{agent.faction || agent.Faction?.name || '未知阵营'}</span>
              <span className="role-tag" data-el={agent.element || agent.Element?.name}>
                {agent.element || agent.Element?.name || '未知属性'}
              </span>
            </div>
          </div>
        </Link>
      ));
    }

    if (activeTab === 'soundEngines') {
      return listState.items.map((engine) => (
        <article key={engine.id} className="wiki-card">
          <div className="wiki-card-image">
            <img
              src={engineImage(engine)}
              alt={engine.name}
              onError={handleImageError}
            />
            <span className="rarity-badge" data-rarity={rarityBadge(engine.rarity || engine.Rarity?.name)}>
              {rarityBadge(engine.rarity || engine.Rarity?.name)}
            </span>
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{engine.name}</h3>
            </div>
            <p>职业适配一眼可见，方便和角色快速配对。</p>
            <div className="wiki-card-tags">
              <span className="role-tag">{engine.role || engine.Role?.name || '未知职业'}</span>
            </div>
          </div>
        </article>
      ));
    }

    if (activeTab === 'bumbos') {
      return listState.items.map((bumbo) => (
        <article key={bumbo.id} className="wiki-card">
          <div className="wiki-card-image">
            <img
              src={bumboImage(bumbo)}
              alt={bumbo.name}
              onError={handleImageError}
            />
            <span className="rarity-badge" data-rarity={rarityBadge(bumbo.rarity || bumbo.Rarity?.name)}>
              {rarityBadge(bumbo.rarity || bumbo.Rarity?.name)}
            </span>
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{bumbo.name}</h3>
            </div>
            <p>更轻量的卡片浏览模式，适合快速扫完整个邦布池。</p>
          </div>
        </article>
      ));
    }

    return listState.items.map((disk) => (
      <article key={disk.id} className="wiki-card">
        <div className="wiki-card-image">
          <img
            src={diskImage(disk)}
            alt={disk.name}
            onError={handleImageError}
          />
        </div>
        <div className="wiki-card-body">
          <div className="wiki-card-heading">
            <h3>{disk.name}</h3>
          </div>
          <p>{disk.description || '当前条目暂未提供描述。'}</p>
        </div>
      </article>
    ));
  };

  if (initialLoading) {
    return (
      <div className="wiki-shell theme-zzz">
        <div className="wiki-status-panel">
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error && initialLoading) {
    return (
      <div className="wiki-shell theme-zzz">
        <div className="wiki-status-panel">
          <p>加载失败：{error}</p>
          <button type="button" className="wiki-error-retry" onClick={handleRetry}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'detail') {
    return (
      <div className="wiki-shell theme-zzz">
        <div className="wiki-backdrop" />
        <div className="wiki-frame">
          {error && <LoadErrorBanner message={error} onRetry={handleRetry} />}
          {!error && baseDataDegraded && (
            <LoadErrorBanner
              message="部分基础数据加载失败，筛选选项可能不完整。"
              onRetry={handleRetry}
            />
          )}
          <AgentDetail agent={selectedAgent} />
        </div>
      </div>
    );
  }

  return (
    <div className="wiki-shell theme-zzz">
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
            <span className="wiki-kicker">Zenless Zone Zero Archive</span>
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
          <Filter
            activeTab={activeTab}
            filters={filters[activeTab]}
            onFilterChange={handleFilterChange}
            optionLists={optionLists}
          />
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

export default memo(ZZZWiki);
