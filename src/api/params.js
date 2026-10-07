export const serializeApiParams = (params = {}) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const items = Array.isArray(value) ? value : [value];
    const joined = items
      .filter((item) => item !== undefined && item !== null && item !== '')
      .map((item) => String(item))
      .join(',');

    if (joined) {
      search.set(key, joined);
    }
  });

  return search.toString();
};

export default serializeApiParams;
