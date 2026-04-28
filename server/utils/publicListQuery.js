export const parsePositiveIntQuery = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
};

export const parseNonNegativeIntQuery = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
};

export const parseStringListQuery = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }

  if (typeof value !== 'string') {
    return [];
  }

  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
};

export const parseNumberListQuery = (value) => (
  parseStringListQuery(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
);
