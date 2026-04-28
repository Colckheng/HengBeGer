import crypto from 'crypto';
import process from 'process';

import { AppError } from '../../src/utils/errorHandler.js';

const ADMIN_SESSION_COOKIE = 'hengbeger_admin_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;
const TEST_ADMIN_PASSWORD = 'TestAdminPassword!1';
const TEST_AUTH_SECRET = 'test-auth-secret';

const normalizeSecret = (value) => (
  typeof value === 'string' ? value.trim() : ''
);

const parseCookies = (cookieHeader = '') => (
  cookieHeader
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = pair.slice(0, separatorIndex);
      const value = pair.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {})
);

const toBase64Url = (value) => Buffer.from(value).toString('base64url');

const signValue = (value, secret) => (
  crypto.createHmac('sha256', secret).update(value).digest('base64url')
);

const secureCompare = (left, right) => {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const getAdminPassword = () => {
  if (process.env.NODE_ENV === 'test') {
    return TEST_ADMIN_PASSWORD;
  }

  return (
    normalizeSecret(process.env.ADMIN_PASSWORD) ||
    normalizeSecret(process.env.ADMIN_API_TOKEN) ||
    (process.env.NODE_ENV !== 'production' ? normalizeSecret(process.env.DB_PASSWORD) : '')
  );
};

const getBearerToken = () => {
  if (process.env.NODE_ENV === 'test') {
    return '';
  }

  return normalizeSecret(process.env.ADMIN_API_TOKEN);
};

const getAuthSecret = () => {
  if (process.env.NODE_ENV === 'test') {
    return TEST_AUTH_SECRET;
  }

  return (
    normalizeSecret(process.env.AUTH_SECRET) ||
    normalizeSecret(process.env.ADMIN_PASSWORD) ||
    (process.env.NODE_ENV !== 'production' ? normalizeSecret(process.env.DB_PASSWORD) : '')
  );
};

const getAuthConfiguration = () => {
  const adminPassword = getAdminPassword();
  const bearerToken = getBearerToken();
  const authSecret = getAuthSecret();

  return {
    adminPassword,
    bearerToken,
    authSecret,
    configured: Boolean(adminPassword && authSecret),
  };
};

const getBearerValue = (req) => {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return '';
  }

  return authorization.slice('Bearer '.length).trim();
};

const createSessionPayload = () => {
  const issuedAt = Date.now();
  return {
    issuedAt,
    expiresAt: issuedAt + SESSION_DURATION_MS,
  };
};

const createSessionToken = (secret) => {
  const payload = createSessionPayload();
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signValue(encodedPayload, secret);

  return {
    token: `${encodedPayload}.${signature}`,
    payload,
  };
};

const verifySignedValue = (value, secret) => {
  if (!value || !secret) {
    return null;
  }

  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  if (!secureCompare(signature, signValue(encodedPayload, secret))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload?.expiresAt || payload.expiresAt <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

const appendSetCookie = (res, cookie) => {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }

  const cookies = Array.isArray(existing) ? existing : [existing];
  res.setHeader('Set-Cookie', [...cookies, cookie]);
};

const buildCookie = (name, value, options = {}) => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    options.httpOnly === false ? '' : 'HttpOnly',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
    'SameSite=Lax',
    typeof options.maxAge === 'number' ? `Max-Age=${Math.floor(options.maxAge / 1000)}` : '',
    options.expires ? `Expires=${options.expires.toUTCString()}` : '',
  ].filter(Boolean);

  return parts.join('; ');
};

export const getAdminSession = (req) => {
  const { authSecret } = getAuthConfiguration();
  if (!authSecret) {
    return null;
  }

  const cookies = parseCookies(req.headers.cookie);
  return verifySignedValue(cookies[ADMIN_SESSION_COOKIE], authSecret);
};

const getAdminSessionFromBearer = (req) => {
  const { authSecret } = getAuthConfiguration();
  const providedToken = getBearerValue(req);
  if (!providedToken || !authSecret) {
    return null;
  }

  return verifySignedValue(providedToken, authSecret);
};

const hasValidBearerToken = (req) => {
  const { bearerToken, adminPassword } = getAuthConfiguration();
  const providedToken = getBearerValue(req);
  if (!providedToken) {
    return false;
  }

  if (getAdminSessionFromBearer(req)) {
    return true;
  }

  return secureCompare(providedToken, bearerToken || adminPassword);
};

export const isAdminAuthenticated = (req) => (
  Boolean(getAdminSession(req) || getAdminSessionFromBearer(req) || hasValidBearerToken(req))
);

export const getAdminAuthStatus = (req) => {
  const config = getAuthConfiguration();
  const session = req.adminSession || getAdminSession(req) || getAdminSessionFromBearer(req);
  const tokenAuthenticated = hasValidBearerToken(req);

  return {
    configured: config.configured,
    authenticated: Boolean(session || tokenAuthenticated),
    expiresAt: session?.expiresAt ?? null,
  };
};

export const requireAdmin = (req, res, next) => {
  const { configured } = getAuthConfiguration();
  if (!configured) {
    next(new AppError('Admin authentication is not configured.', 503));
    return;
  }

  if (!isAdminAuthenticated(req)) {
    next(new AppError('Unauthorized admin request.', 401));
    return;
  }

  next();
};

export const createAdminSession = (req, res, next) => {
  const { adminPassword, authSecret, configured } = getAuthConfiguration();
  if (!configured) {
    next(new AppError('Admin authentication is not configured.', 503));
    return;
  }

  const password = normalizeSecret(req.body?.password);
  if (!password) {
    next(new AppError('Password is required.', 400));
    return;
  }

  if (!secureCompare(password, adminPassword)) {
    next(new AppError('Invalid admin password.', 401));
    return;
  }

  const { token, payload } = createSessionToken(authSecret);
  appendSetCookie(
    res,
    buildCookie(ADMIN_SESSION_COOKIE, token, {
      maxAge: SESSION_DURATION_MS,
    }),
  );
  req.adminSession = payload;
  req.adminSessionToken = token;
  next();
};

export const clearAdminSession = (res) => {
  appendSetCookie(
    res,
    buildCookie(ADMIN_SESSION_COOKIE, '', {
      maxAge: 0,
      expires: new Date(0),
    }),
  );
};

export const TEST_AUTH = {
  password: TEST_ADMIN_PASSWORD,
  secret: TEST_AUTH_SECRET,
};
