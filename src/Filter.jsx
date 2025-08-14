import React from 'react';

// 定义筛选选项常量
const ROLES = ['强攻', '异常', '击破', '防护', '支援', '命破'];
const ELEMENTS = ['电', '火', '冰', '以太', '物理'];
const FACTIONS = ['狡兔屋', '刑侦特勤组', 'H.S.O.S.6', '白祈重工', '维多利亚家政', '卡吕冬之子', '天琴座', '奥伯勒斯小队', '反舌鸟', '云岿山', '怪啖屋'];
const SOUND_ROLES = ['强攻', '异常', '击破', '防护', '支援'];
const RARITIES = ['S', 'A', 'B'];
const BUMBO_TYPES = ['电气', '火焰', '冰冻', '毒素'];
const BUMBO_RARITIES = ['S', 'A'];

// 筛选组件
const Filter = ({ 
  activeTab,
  filters,
  onFilterChange
}) => {
  // 提取当前标签的筛选状态
  const tabFilters = filters || {};

  // 处理多选逻辑
  const handleMultiSelect = (tab, filterType, value) => {
    const currentValues = tabFilters[filterType] || [];
    let newValues;
    
    if (value === 'all') {
      newValues = [];
    } else {
      if (currentValues.includes(value)) {
        // 如果已选中，则取消选择
        newValues = currentValues.filter(v => v !== value);
      } else {
        // 如果未选中，则添加选择
        newValues = [...currentValues, value];
      }
    }
    
    onFilterChange(tab, filterType, newValues);
  };

  return (
      <div className="filter-container">
        {/* 代理人筛选 */}
        {activeTab === 'agents' && (
          <div className="agents-filter-horizontal">
            <div className="filter-group">
              <h3>职业</h3>
              <div className="filter-options">
                <button
                  className={(!tabFilters.role || tabFilters.role.length === 0) ? 'active' : ''}
                  onClick={() => handleMultiSelect('agents', 'role', 'all')}
                >
                  全部
                </button>
                {ROLES.map((role) => (
                  <button
                    key={role}
                    className={(tabFilters.role && tabFilters.role.includes(role)) ? 'active' : ''}
                    onClick={() => handleMultiSelect('agents', 'role', role)}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <h3>属性</h3>
              <div className="filter-options">
                <button
                  className={(!tabFilters.element || tabFilters.element.length === 0) ? 'active' : ''}
                  onClick={() => handleMultiSelect('agents', 'element', 'all')}
                >
                  全部
                </button>
                {ELEMENTS.map((element) => (
                  <button
                    key={element}
                    className={(tabFilters.element && tabFilters.element.includes(element)) ? 'active' : ''}
                    onClick={() => handleMultiSelect('agents', 'element', element)}
                  >
                    {element}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <h3>阵营</h3>
              <div className="filter-options-two-rows">
                <div className="filter-row">
                  <button
                    className={(!tabFilters.faction || tabFilters.faction.length === 0) ? 'active' : ''}
                    onClick={() => handleMultiSelect('agents', 'faction', 'all')}
                  >
                    全部
                  </button>
                  {FACTIONS.slice(0, 6).map((faction) => (
                    <button
                      key={faction}
                      className={(tabFilters.faction && tabFilters.faction.includes(faction)) ? 'active' : ''}
                      onClick={() => handleMultiSelect('agents', 'faction', faction)}
                    >
                      {faction}
                    </button>
                  ))}
                </div>
                <div className="filter-row">
                  {FACTIONS.slice(6).map((faction) => (
                    <button
                      key={faction}
                      className={(tabFilters.faction && tabFilters.faction.includes(faction)) ? 'active' : ''}
                      onClick={() => handleMultiSelect('agents', 'faction', faction)}
                    >
                      {faction}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 音擎筛选 */}
        {activeTab === 'soundEngines' && (
          <div className="soundengines-filter-horizontal">
            <div className="filter-group">
              <h3>类型</h3>
              <div className="filter-options">
                <button
                  className={!tabFilters.role || tabFilters.role.length === 0 ? 'active' : ''}
                  onClick={() => handleMultiSelect('soundEngines', 'role', null)}
                >
                  全部
                </button>
                {SOUND_ROLES.map((role) => (
                  <button
                    key={role}
                    className={(tabFilters.role && tabFilters.role.includes(role)) ? 'active' : ''}
                    onClick={() => handleMultiSelect('soundEngines', 'role', role)}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <h3>稀有度</h3>
              <div className="filter-options">
                <button
                  className={!tabFilters.rarity || tabFilters.rarity.length === 0 ? 'active' : ''}
                  onClick={() => handleMultiSelect('soundEngines', 'rarity', null)}
                >
                  全部
                </button>
                {RARITIES.map((rarity) => (
                  <button
                    key={rarity}
                    className={(tabFilters.rarity && tabFilters.rarity.includes(rarity)) ? 'active' : ''}
                    onClick={() => handleMultiSelect('soundEngines', 'rarity', rarity)}
                  >
                    {rarity}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 邦布筛选 */}
        {activeTab === 'bumbos' && (
          <div className="bumbos-filter-horizontal">
            <div className="filter-group">
              <h3>等级</h3>
              <div className="filter-options">
                <button
                  className={!tabFilters.rarity || tabFilters.rarity.length === 0 ? 'active' : ''}
                  onClick={() => handleMultiSelect('bumbos', 'rarity', null)}
                >
                  全部
                </button>
                {BUMBO_RARITIES.map((rarity) => (
                  <button
                    key={rarity}
                    className={(tabFilters.rarity && tabFilters.rarity.includes(rarity)) ? 'active' : ''}
                    onClick={() => handleMultiSelect('bumbos', 'rarity', rarity)}
                  >
                    {rarity}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 驱动盘无筛选功能 */}
      </div>
  );
};

export default Filter;