const ROLES = ['强攻', '异常', '击破', '防护', '支援', '命破'];
const ELEMENTS = ['电', '火', '冰', '以太', '物理'];
const FACTIONS = [
  '狡兔屋',
  '刑侦特勤组',
  'H.S.O.S.6',
  '白祇重工',
  '维多利亚家政',
  '卡吕冬之子',
  '天琴座',
  '奥伯勒斯小队',
  '反舌鸟',
  '云岿山',
  '怪啸屋',
];
const SOUND_ROLES = ['强攻', '异常', '击破', '防护', '支援'];
const RARITIES = ['S', 'A', 'B'];
const BUMBO_RARITIES = ['S', 'A'];

const buildActiveState = (values = [], candidate) => values.includes(candidate);

const toggleMultiSelect = (values = [], candidate) => (
  values.includes(candidate)
    ? values.filter((value) => value !== candidate)
    : [...values, candidate]
);

const FilterGroup = ({
  title,
  values = [],
  options,
  onReset,
  onToggle,
  wrap = false,
}) => (
  <div className="filter-group">
    <h3>{title}</h3>
    <div className={wrap ? 'filter-options filter-options-wrap' : 'filter-options'}>
      <button
        type="button"
        className={!values.length ? 'active' : ''}
        onClick={onReset}
      >
        全部
      </button>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={buildActiveState(values, option) ? 'active' : ''}
          onClick={() => onToggle(option)}
        >
          {option}
        </button>
      ))}
    </div>
  </div>
);

const Filter = ({
  activeTab,
  filters,
  onFilterChange,
}) => {
  const currentFilters = filters || {};

  if (activeTab === 'agents') {
    return (
      <div className="filter-container">
        <FilterGroup
          title="职业"
          values={currentFilters.role}
          options={ROLES}
          onReset={() => onFilterChange('agents', 'role', [])}
          onToggle={(option) => onFilterChange(
            'agents',
            'role',
            toggleMultiSelect(currentFilters.role, option),
          )}
        />
        <FilterGroup
          title="属性"
          values={currentFilters.element}
          options={ELEMENTS}
          onReset={() => onFilterChange('agents', 'element', [])}
          onToggle={(option) => onFilterChange(
            'agents',
            'element',
            toggleMultiSelect(currentFilters.element, option),
          )}
        />
        <FilterGroup
          title="阵营"
          values={currentFilters.faction}
          options={FACTIONS}
          wrap
          onReset={() => onFilterChange('agents', 'faction', [])}
          onToggle={(option) => onFilterChange(
            'agents',
            'faction',
            toggleMultiSelect(currentFilters.faction, option),
          )}
        />
      </div>
    );
  }

  if (activeTab === 'soundEngines') {
    return (
      <div className="filter-container">
        <FilterGroup
          title="职业"
          values={currentFilters.role}
          options={SOUND_ROLES}
          onReset={() => onFilterChange('soundEngines', 'role', [])}
          onToggle={(option) => onFilterChange(
            'soundEngines',
            'role',
            toggleMultiSelect(currentFilters.role, option),
          )}
        />
        <FilterGroup
          title="稀有度"
          values={currentFilters.rarity}
          options={RARITIES}
          onReset={() => onFilterChange('soundEngines', 'rarity', [])}
          onToggle={(option) => onFilterChange(
            'soundEngines',
            'rarity',
            toggleMultiSelect(currentFilters.rarity, option),
          )}
        />
      </div>
    );
  }

  if (activeTab === 'bumbos') {
    return (
      <div className="filter-container">
        <FilterGroup
          title="稀有度"
          values={currentFilters.rarity}
          options={BUMBO_RARITIES}
          onReset={() => onFilterChange('bumbos', 'rarity', [])}
          onToggle={(option) => onFilterChange(
            'bumbos',
            'rarity',
            toggleMultiSelect(currentFilters.rarity, option),
          )}
        />
      </div>
    );
  }

  return null;
};

export default Filter;
