const ADMIN_SESSION_TOKEN_KEY = 'hengbeger_admin_session_token';

const hasSessionStorage = () => (
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
);

export const getStoredAdminSessionToken = () => {
  if (!hasSessionStorage()) {
    return '';
  }

  try {
    return window.sessionStorage.getItem(ADMIN_SESSION_TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setStoredAdminSessionToken = (token) => {
  if (!hasSessionStorage()) {
    return;
  }

  try {
    if (token) {
      window.sessionStorage.setItem(ADMIN_SESSION_TOKEN_KEY, token);
      return;
    }

    window.sessionStorage.removeItem(ADMIN_SESSION_TOKEN_KEY);
  } catch {
    // Ignore storage write failures and fall back to cookie auth only.
  }
};

export const clearStoredAdminSessionToken = () => {
  setStoredAdminSessionToken('');
};
