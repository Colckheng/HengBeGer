import { useEffect, useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';

import {
  clearStoredAdminSessionToken,
  setStoredAdminSessionToken,
} from '../api/adminSession.js';
import apiClient from '../api/client.js';
import { getApiErrorMessage } from '../utils/apiError.js';

const COPY = {
  sessionCheckFailed: '管理员会话检查失败。',
  loginFailed: '登录失败。',
  checkingSession: '正在检查管理员会话...',
  missingConfig: '管理员认证尚未配置。请先设置 `ADMIN_PASSWORD` 和 `AUTH_SECRET`。',
  title: '管理员登录',
  subtitle: '沿用现有 Cookie / Session Token 鉴权链路，只升级视觉与交互层。',
  passwordLabel: '管理员密码',
  loggingIn: '登录中...',
  login: '登录',
  retry: '重试',
};

const AdminAuthGate = ({ children }) => {
  const inRouterContext = useInRouterContext();
  const [status, setStatus] = useState({
    loading: true,
    configured: true,
    authenticated: false,
    expiresAt: null,
    failed: false,
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const loadSession = async (isCancelled = () => false) => {
    setStatus((current) => ({ ...current, loading: true }));

    try {
      const response = await apiClient.get('/auth/session');
      if (isCancelled()) {
        return;
      }

      setStatus({
        loading: false,
        configured: Boolean(response.data?.configured),
        authenticated: Boolean(response.data?.authenticated),
        expiresAt: response.data?.expiresAt || null,
        failed: false,
      });

      if (!response.data?.authenticated) {
        clearStoredAdminSessionToken();
      }

      setError('');
    } catch (sessionError) {
      if (isCancelled()) {
        return;
      }

      if (sessionError?.response?.status === 401) {
        clearStoredAdminSessionToken();
        setStatus({
          loading: false,
          configured: true,
          authenticated: false,
          expiresAt: null,
          failed: false,
        });
        setError('');
        return;
      }

      setStatus({
        loading: false,
        configured: true,
        authenticated: false,
        expiresAt: null,
        failed: true,
      });
      setError(getApiErrorMessage(sessionError, COPY.sessionCheckFailed));
    }
  };

  useEffect(() => {
    let cancelled = false;
    void loadSession(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [retryNonce]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await apiClient.post('/auth/session', { password });
      setStoredAdminSessionToken(response.data?.sessionToken || '');
      setPassword('');
      await loadSession();
    } catch (loginError) {
      clearStoredAdminSessionToken();
      setError(getApiErrorMessage(loginError, COPY.loginFailed));
    } finally {
      setSubmitting(false);
    }
  };

  if (status.loading) {
    return (
      <div className="loading-container">
        <p>{COPY.checkingSession}</p>
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="error-container">
        <p>{COPY.missingConfig}</p>
      </div>
    );
  }

  if (status.failed) {
    return (
      <div className="error-container">
        <p>{error || COPY.sessionCheckFailed}</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setError('');
            setRetryNonce((current) => current + 1);
          }}
        >
          {COPY.retry}
        </button>
      </div>
    );
  }

  if (!status.authenticated) {
    return (
      <div className="admin-login-shell">
        <div className="admin-login-card">
          <p className="wiki-kicker">Admin Access</p>
          <h1 className="admin-login-title">{COPY.title}</h1>
          <p className="admin-login-copy">{COPY.subtitle}</p>
          <form onSubmit={handleSubmit} className="admin-form">
            <div className="form-group">
              <label htmlFor="admin-password">{COPY.passwordLabel}</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? COPY.loggingIn : COPY.login}
              </button>
              {inRouterContext ? (
                <Link to="/" className="btn-secondary">返回首页</Link>
              ) : (
                <a href="/" className="btn-secondary">返回首页</a>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return children;
};

export default AdminAuthGate;
