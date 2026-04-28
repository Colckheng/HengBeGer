import apiClient from './client.js';

export const DEFAULT_PUBLIC_PAGE_SIZE = 12;

const normalizeNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

export const normalizePaginatedPayload = (payload = {}) => {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const limit = normalizeNumber(payload.limit, DEFAULT_PUBLIC_PAGE_SIZE) || DEFAULT_PUBLIC_PAGE_SIZE;
  const offset = normalizeNumber(payload.offset, 0);
  const total = normalizeNumber(payload.total, items.length);

  return {
    items,
    total,
    limit,
    offset,
    hasMore: typeof payload.hasMore === 'boolean' ? payload.hasMore : offset + items.length < total,
  };
};

export const fetchPublicList = async (endpoint, params = {}, client = apiClient) => {
  const response = await client.get(endpoint, { params });
  return normalizePaginatedPayload(response.data?.data || response.data);
};

export default fetchPublicList;
