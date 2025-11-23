import React, { useState, useEffect, memo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './ZZZWiki.css';
import { useData } from './DataContext';

import Filter from './Filter';

const ZZZWiki = ({ mode = 'list', agentId = null }) => {
  // 从context获取数据，不再使用模拟数据

  const { data, loading, error } = useData();
  const [activeTab, setActiveTab] = useState('agents');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [filters, setFilters] = useState({
    agents: { role: [], element: [], faction: [] },
    soundEngines: { role: [], rarity: [] },
    bumbos: { rarity: [] },
    hsrCharacters: { element: [], path: [], rarity: [] },
    hsrCones: { path: [], rarity: [] },
    hsrRelics: { type: [], part: [] }
  });
  const [filteredData, setFilteredData] = useState([]);
  const navigate = useNavigate();

  // 根据agentId查找代理人
  useEffect(() => {
    if (mode === 'detail' && agentId) {
      const agent = data.agents.find(a => a.id === parseInt(agentId));
      setSelectedAgent(agent);
    }
  }, [mode, agentId, data.agents]);

  // 筛选数据
  useEffect(() => {
    if (!data || !activeTab) return;

    let filtered = Array.isArray(data[activeTab]) ? data[activeTab] : [];
    const tabFilters = filters[activeTab] || {};

    // 根据当前标签应用对应的筛选
    switch(activeTab) {
      case 'agents':
        filtered = filtered.filter(item => {
          // 职业筛选：如果没有选择任何职业，显示全部；否则显示选中的职业
          const roleMatch = !tabFilters.role || tabFilters.role.length === 0 || tabFilters.role.includes(item.role || item.Role?.name);
          // 属性筛选：如果没有选择任何属性，显示全部；否则显示选中的属性
          const elementMatch = !tabFilters.element || tabFilters.element.length === 0 || tabFilters.element.includes(item.element || item.Element?.name);
          // 阵营筛选：如果没有选择任何阵营，显示全部；否则显示选中的阵营
          const factionMatch = !tabFilters.faction || tabFilters.faction.length === 0 || tabFilters.faction.includes(item.faction || item.Faction?.name);
          
          // 所有条件都要满足（AND关系）
          return roleMatch && elementMatch && factionMatch;
        });
        break;
      case 'soundEngines':
        filtered = filtered.filter(item => {
          // 类型筛选：如果没有选择任何类型，显示全部；否则显示选中的类型
          const roleMatch = !tabFilters.role || tabFilters.role.length === 0 || tabFilters.role.includes(item.role || item.Role?.name);
          // 稀有度筛选：如果没有选择任何稀有度，显示全部；否则显示选中的稀有度
          const rarityMatch = !tabFilters.rarity || tabFilters.rarity.length === 0 || tabFilters.rarity.includes(item.rarity || item.Rarity?.name);
          
          // 所有条件都要满足（AND关系）
          return roleMatch && rarityMatch;
        });
        break;
      case 'bumbos':
        filtered = filtered.filter(item => {
          // 等级筛选：如果没有选择任何等级，显示全部；否则显示选中的等级
          const rarityMatch = !tabFilters.rarity || tabFilters.rarity.length === 0 || tabFilters.rarity.includes(item.rarity || item.Rarity?.name);
          
          return rarityMatch;
        });
        break;
      case 'driveDisks':
        // 驱动盘无筛选功能，显示全部
        break;
      case 'hsrCharacters':
        filtered = filtered.filter(item => {
          const eMatch = !tabFilters.element || tabFilters.element.length === 0 || tabFilters.element.includes(item.element || item.HsrElement?.name)
          const pMatch = !tabFilters.path || tabFilters.path.length === 0 || tabFilters.path.includes(item.path || item.HsrPath?.name)
          const rMatch = !tabFilters.rarity || tabFilters.rarity.length === 0 || tabFilters.rarity.includes(item.rarity || item.HsrRarity?.name)
          return eMatch && pMatch && rMatch
        })
        break;
      case 'hsrCones':
        filtered = filtered.filter(item => {
          const pMatch = !tabFilters.path || tabFilters.path.length === 0 || tabFilters.path.includes(item.path || item.HsrPath?.name)
          const rMatch = !tabFilters.rarity || tabFilters.rarity.length === 0 || tabFilters.rarity.includes(item.rarity || item.HsrRarity?.name)
          return pMatch && rMatch
        })
        break;
      case 'hsrRelics':
        filtered = filtered.filter(item => {
          const tMatch = !tabFilters.type || tabFilters.type.length === 0 || tabFilters.type.includes(item.type || item.HsrRelicType?.name)
          const partMatch = !tabFilters.part || tabFilters.part.length === 0 || tabFilters.part.includes(item.part)
          return tMatch && partMatch
        })
        break;
    }

    setFilteredData(filtered);
  }, [data, activeTab, filters]);

  // 处理筛选变化
  const handleFilterChange = (tab, filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [filterType]: value
      }
    }));
  };  

  // 辅助函数：将稀有度转换为等级标签
  const getRarityBadge = (rarity) => {
    switch(rarity) {
      case 'SSR':
      case 'S': return 'S';
      case 'SR':
      case 'A': return 'A';
      case 'B': return 'B';
      default: return 'B';
    }
  };

  // 处理代理人卡片点击事件
  const handleAgentClick = (agent) => {
    setSelectedAgent(agent);
    navigate(`/zzz-wiki/agent/${agent.id}`);
  };

    // 根据当前选中的标签显示对应内容
  const renderContent = () => {
      // 如果是详情模式，显示代理人详情
      if (mode === 'detail') {
        return (
          <div className="detail-container">
            <button onClick={() => navigate(-1)}>返回</button>
            {selectedAgent ? (
              <>
                <img src={selectedAgent.image} alt={selectedAgent.name} className="detail-image" />
                <h2>{selectedAgent.name}</h2>
                <p className="role">{selectedAgent.role || selectedAgent.Role?.name || '未知职业'}</p>
                <p>{selectedAgent.description}</p>
              </>
            ) : (
              <p>未找到该代理人</p>
            )}
          </div>
        );
      }

      // 列表模式下根据标签显示不同内容
      switch(activeTab) {
        case 'agents':
          const filteredAgents = (Array.isArray(filteredData) && filteredData.length > 0) ? filteredData : (Array.isArray(data.agents) ? data.agents : []);
          return (
            <div className="content-section">
              <h2 className="section-title">代理人</h2>
              <Filter 
                activeTab={activeTab}
                filters={filters[activeTab]}
                onFilterChange={handleFilterChange}
              />
              <div className="content-grid">
              {filteredAgents.length === 0 ? (
                <div className="empty-state">
                  <p>暂无代理人数据</p>
                </div>
              ) : (
                filteredAgents.map(agent => (
                  <div
                    key={agent.id}
                    className="card"
                    onClick={() => handleAgentClick(agent)}
                  >
                    <img 
                      src={agent.image && agent.image.startsWith('data:') ? agent.image : (agent.image || `/images/agents/${agent.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.jpg`)} 
                      alt={agent.name} 
                      className="card-image" 
                      onError={(e) => { e.target.src = '/assets/zzz.jpg'; }} 
                    />
                    <h3>{agent.name}</h3>
                    <p className="card-role">{agent.role || agent.Role?.name || '未知职业'}</p>
                    <div className="card-footer">
                      <span className="rarity-badge" data-rarity={getRarityBadge(agent.rarity || agent.Rarity?.name)}>{getRarityBadge(agent.rarity || agent.Rarity?.name)}</span>
                      <span className="role-tag">{agent.faction || agent.Faction?.name || '未知阵营'}</span>
                    </div>
                  </div>
                ))
              )}
              </div>
            </div>
          );
        case 'soundEngines':
          const filteredSoundEngines = (Array.isArray(filteredData) && filteredData.length > 0) ? filteredData : (Array.isArray(data.soundEngines) ? data.soundEngines : []);
          return (
            <div className="content-section">
              <h2 className="section-title">音擎</h2>
              <Filter 
                activeTab={activeTab}
                filters={filters[activeTab]}
                onFilterChange={handleFilterChange}
              />
              <div className="content-grid">
              {filteredSoundEngines.map(engine => (
                <div key={engine.id} className="card">
                  <img src={engine.image} alt={engine.name} className="card-image" onError={(e) => { e.target.src = '/assets/zzz.jpg'; }} />
                  <h3>{engine.name}</h3>
                  <div className="card-footer">
                    <span className="rarity-badge" data-rarity={getRarityBadge(engine.rarity || engine.Rarity?.name)}>{getRarityBadge(engine.rarity || engine.Rarity?.name)}</span>
                    <span className="role-tag">{engine.role || engine.Role?.name || '未知职业'}</span>
                  </div>
                </div>
              ))}
              </div>
            </div>
          );
        case 'bumbos':
          const filteredBumbos = (Array.isArray(filteredData) && filteredData.length > 0) ? filteredData : (Array.isArray(data.bumbos) ? data.bumbos : []);
          return (
            <div className="content-section">
              <h2 className="section-title">邦布</h2>
              <Filter 
                activeTab={activeTab}
                filters={filters[activeTab]}
                onFilterChange={handleFilterChange}
              />
              <div className="content-grid">
              {filteredBumbos.map(bumbo => (
                <div key={bumbo.id} className="card">
                  <img src={bumbo.image} alt={bumbo.name} className="card-image" onError={(e) => { e.target.src = '/assets/zzz.jpg'; }} />
                  <h3>{bumbo.name}</h3>
                  <div className="card-footer">
                    <span className="rarity-badge" data-rarity={getRarityBadge(bumbo.rarity || bumbo.Rarity?.name)}>{getRarityBadge(bumbo.rarity || bumbo.Rarity?.name)}</span>
                  </div>
                </div>
              ))}
              </div>
            </div>
          );
        case 'driveDisks':
          const filteredDriveDisks = (Array.isArray(filteredData) && filteredData.length > 0) ? filteredData : (Array.isArray(data.driveDisks) ? data.driveDisks : []);
          return (
            <div className="content-section">
              <h2 className="section-title">驱动盘</h2>
              <Filter 
                activeTab={activeTab}
                filters={filters[activeTab]}
                onFilterChange={handleFilterChange}
              />
              <div className="content-grid">
              {filteredDriveDisks.map(disk => (
              <div key={disk.id} className="card">
                <img src={disk.image} alt={disk.name} className="card-image" onError={(e) => { e.target.src = '/assets/zzz.jpg'; }} />
                <h3>{disk.name}</h3>
                <p>{disk.description}</p>
              </div>
            ))}
            </div>
          </div>
        );
      default:
        return <div>请选择一个分类</div>;
    }
  };

  return (
    <div className="wiki-container">
      <div className="sidebar open fixed-sidebar">
        <div className="sidebar-header">
          <Link to="/" className="home-link"><h2 className="wiki-title">HengZZZ</h2></Link>
        </div>
        <nav className="sidebar-nav">
          <ul>
            <li
              className={activeTab === 'agents' ? 'active' : ''}
              onClick={() => setActiveTab('agents')}
            >
              代理人
            </li>
            <li
              className={activeTab === 'soundEngines' ? 'active' : ''}
              onClick={() => setActiveTab('soundEngines')}
            >
              音擎
            </li>
            <li
              className={activeTab === 'bumbos' ? 'active' : ''}
              onClick={() => setActiveTab('bumbos')}
            >
              邦布
            </li>
            <li
              className={activeTab === 'driveDisks' ? 'active' : ''}
              onClick={() => setActiveTab('driveDisks')}
            >
              驱动盘
            </li>
          </ul>
        </nav>
      </div>
      <div className="main-content">
        {loading ? (
          <div className="loading-container">
            <p>加载中...</p>
          </div>
        ) : error ? (
          <div className="error-container">
            <p>加载失败: {error}</p>
          </div>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  );
};

// 使用memo优化组件，避免不必要的重渲染
export default memo(ZZZWiki);