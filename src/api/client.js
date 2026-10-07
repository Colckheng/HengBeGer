import axios from 'axios';

import { getStoredAdminSessionToken } from './adminSession.js';
import { API_BASE_URL } from './config.js';
import { serializeApiParams } from './params.js';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  paramsSerializer: {
    serialize: serializeApiParams,
  },
});

apiClient.interceptors.request.use((config) => {
  const sessionToken = getStoredAdminSessionToken();
  if (!sessionToken) {
    return config;
  }

  config.headers = config.headers || {};
  config.headers.Authorization = `Bearer ${sessionToken}`;
  return config;
});

export default apiClient;
