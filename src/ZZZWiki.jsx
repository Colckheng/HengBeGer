import {
  memo,
  startTransition,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';

import zzz from './assets/zzz.jpg';
import PaginationControls from './components/PaginationControls.jsx';
import { useData } from './DataContext.jsx';
import Filter from './Filter.jsx';
import usePaginatedPublicList from './hooks/usePaginatedPublicList.js';
import { buildZzzListRequest } from './utils/publicFilterParams.js';
import './ZZZWiki.css';

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
  const image = item.image;
  if (image && (image.startsWith('data:') || image.startsWith('/'))) {
    return image;
  }

  return image || fallback;
};

const agentImage = (item) => normalizeImage(`/images/agents/${item.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.jpg`)(item);
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

const AgentDetail = ({ agent, onBack }) => {
  if (!agent) {
    return (
      <div className="wiki-status-panel">
        <p>未找到该代理人。</p>
      </div>
    );
  }

  return (
    <section className="detail-shell">
      <button type="button" className="ghost-action" onClick={onBack}>
        返回列表
      </button>
      <div className="detail-surface">
        <div className="detail-media">
          <img
            src={agentImage(agent)}
            alt={agent.name}
            onError={(event) => {
              event.currentTarget.src = zzz;
            }}
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
  const navigate = useNavigate();
  const {
    data,
    baseData,
    loading: contextLoading,
    error: contextError,
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

  const listState = usePaginatedPublicList({
    endpoint: TAB_CONFIG[activeTab].endpoint,
    filters: requestFilters,
    enabled: mode !== 'detail',
    resetKey: activeTab,
    fallbackError: '加载列表失败。',
  });

  const loading = mode === 'detail' ? contextLoading : contextLoading || listState.loading;
  const error = mode === 'detail' ? contextError : listState.error || contextError;
  const selectedFilterCount = countSelectedFilters(filters[activeTab]);

  const heroStats = useMemo(() => ([
    {
      label: '当前分类',
      value: TAB_CONFIG[activeTab].title,
      detail: '当前展示资料类型',
      accent: 'amber',
      kind: 'category',
    },
    {
      label: '总条目',
      value: mode === 'detail' ? (data.agents?.length || 0) : listState.total,
      detail: `当前分类共 ${mode === 'detail' ? (data.agents?.length || 0) : listState.total} 条`,
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
  ]), [activeTab, data.agents?.length, listState.total, mode, selectedFilterCount]);

  const handleFilterChange = (tab, filterType, value) => {
    setFilters((current) => ({
      ...current,
      [tab]: {
        ...current[tab],
        [filterType]: value,
      },
    }));
  };

  const handleAgentClick = (agent) => {
    setSelectedAgent(agent);
    navigate(`/zzz-wiki/agent/${agent.id}`);
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
        <article
          key={agent.id}
          className="wiki-card is-clickable"
          onClick={() => handleAgentClick(agent)}
        >
          <div className="wiki-card-image">
            <img
              src={agentImage(agent)}
              alt={agent.name}
              onError={(event) => {
                event.currentTarget.src = zzz;
              }}
            />
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{agent.name}</h3>
              <span className="rarity-badge" data-rarity={rarityBadge(agent.rarity || agent.Rarity?.name)}>
                {rarityBadge(agent.rarity || agent.Rarity?.name)}
              </span>
            </div>
            <p>{agent.role || agent.Role?.name || '未知职业'}</p>
            <div className="wiki-card-tags">
              <span className="role-tag">{agent.faction || agent.Faction?.name || '未知阵营'}</span>
              <span className="role-tag">{agent.element || agent.Element?.name || '未知属性'}</span>
            </div>
          </div>
        </article>
      ));
    }

    if (activeTab === 'soundEngines') {
      return listState.items.map((engine) => (
        <article key={engine.id} className="wiki-card">
          <div className="wiki-card-image">
            <img
              src={engineImage(engine)}
              alt={engine.name}
              onError={(event) => {
                event.currentTarget.src = zzz;
              }}
            />
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{engine.name}</h3>
              <span className="rarity-badge" data-rarity={rarityBadge(engine.rarity || engine.Rarity?.name)}>
                {rarityBadge(engine.rarity || engine.Rarity?.name)}
              </span>
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
              onError={(event) => {
                event.currentTarget.src = zzz;
              }}
            />
          </div>
          <div className="wiki-card-body">
            <div className="wiki-card-heading">
              <h3>{bumbo.name}</h3>
              <span className="rarity-badge" data-rarity={rarityBadge(bumbo.rarity || bumbo.Rarity?.name)}>
                {rarityBadge(bumbo.rarity || bumbo.Rarity?.name)}
              </span>
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
            onError={(event) => {
              event.currentTarget.src = zzz;
            }}
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

  if (loading) {
    return (
      <div className="wiki-shell theme-zzz">
        <div className="wiki-status-panel">
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wiki-shell theme-zzz">
        <div className="wiki-status-panel">
          <p>加载失败：{error}</p>
        </div>
      </div>
    );
  }

  if (mode === 'detail') {
    return (
      <div className="wiki-shell theme-zzz">
        <div className="wiki-backdrop" />
        <div className="wiki-frame">
          <header className="wiki-topbar">
            <Link to="/" className="wiki-brand">HengBeGer</Link>
            <div className="wiki-topbar-actions">
              <Link to="/zzz-wiki" className="ghost-action">返回 ZZZ</Link>
              <Link to="/zzz-wiki/admin" className="solid-action">内容后台</Link>
            </div>
          </header>
          <AgentDetail
            agent={selectedAgent}
            onBack={() => navigate('/zzz-wiki')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="wiki-shell theme-zzz">
      <div className="wiki-backdrop" />
      <div className="wiki-frame">
        <header className="wiki-topbar">
          <Link to="/" className="wiki-brand">HengBeGer</Link>
          <div className="wiki-topbar-actions">
            <Link to="/hsr-wiki" className="ghost-action">切到 HSR</Link>
            <Link to="/zzz-wiki/admin" className="solid-action">内容后台</Link>
          </div>
        </header>

        <section className="wiki-hero">
          <div className="wiki-hero-copy">
            <p className="wiki-kicker">Zenless Zone Zero Archive</p>
            <h1>HengZZZ</h1>
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
            当前页共 {listState.total} 条，支持分页浏览与多维筛选。
          </p>
        </section>

        <section className="wiki-surface">
          <Filter
            activeTab={activeTab}
            filters={filters[activeTab]}
            onFilterChange={handleFilterChange}
          />
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

export default memo(ZZZWiki);
