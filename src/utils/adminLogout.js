import { clearStoredAdminSessionToken } from '../api/adminSession.js';
import apiClient from '../api/client.js';

const reloadWindow = () => {
  if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
    window.location.reload();
  }
};

export const logoutAdminSession = async ({
  client = apiClient,
  clearToken = clearStoredAdminSessionToken,
  reload = reloadWindow,
} = {}) => {
  let clearedOnServer = true;

  try {
    await client.delete('/auth/session');
  } catch {
    clearedOnServer = false;
  } finally {
    clearToken();
    reload();
  }

  return clearedOnServer;
};

export default logoutAdminSession;
