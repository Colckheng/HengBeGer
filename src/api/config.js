const stripTrailingSlash = (value) => value.replace(/\/+$/, '');

export const API_BASE_URL = (() => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configured) {
    return '/api';
  }

  return stripTrailingSlash(configured);
})();

export const buildApiUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
