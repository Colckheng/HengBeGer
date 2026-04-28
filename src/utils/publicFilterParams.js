const normalizeSelectedNames = (value) => (
  Array.isArray(value) ? value.filter(Boolean) : []
);

const namesToIds = (selectedNames, options = []) => {
  const selected = new Set(normalizeSelectedNames(selectedNames));
  if (selected.size === 0) {
    return [];
  }

  return options
    .filter((option) => option && selected.has(option.name))
    .map((option) => option.id);
};

const withOptionalList = (values) => (
  Array.isArray(values) && values.length > 0 ? values : undefined
);

export const buildZzzListRequest = (tab, filters = {}, baseData = {}) => {
  switch (tab) {
    case 'agents':
      return {
        roleIds: withOptionalList(namesToIds(filters.role, baseData.roles)),
        factionIds: withOptionalList(namesToIds(filters.faction, baseData.factions)),
        rarityIds: withOptionalList(namesToIds(filters.rarity, baseData.rarities)),
        elements: withOptionalList(normalizeSelectedNames(filters.element)),
      };
    case 'soundEngines':
      return {
        roleIds: withOptionalList(namesToIds(filters.role, baseData.roles)),
        rarityIds: withOptionalList(namesToIds(filters.rarity, baseData.rarities)),
      };
    case 'bumbos':
      return {
        rarityIds: withOptionalList(namesToIds(filters.rarity, baseData.rarities)),
      };
    case 'driveDisks':
    default:
      return {};
  }
};

export const buildHsrListRequest = (tab, filters = {}, baseData = {}) => {
  const hsr = baseData.hsr || {};

  switch (tab) {
    case 'hsrCharacters':
      return {
        elementIds: withOptionalList(namesToIds(filters.element, hsr.elements)),
        pathIds: withOptionalList(namesToIds(filters.path, hsr.paths)),
        rarityIds: withOptionalList(namesToIds(filters.rarity, hsr.rarities)),
      };
    case 'hsrCones':
      return {
        pathIds: withOptionalList(namesToIds(filters.path, hsr.paths)),
        rarityIds: withOptionalList(namesToIds(filters.rarity, hsr.rarities)),
      };
    case 'hsrRelics':
      return {
        typeIds: withOptionalList(namesToIds(filters.type, hsr.relicTypes)),
        parts: withOptionalList(normalizeSelectedNames(filters.part)),
      };
    default:
      return {};
  }
};
