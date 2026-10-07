import crypto from 'crypto';
import process from 'process';

import { logAdminAudit } from '../../src/utils/adminAudit.js';
import { AppError } from '../../src/utils/errorHandler.js';

const ADMIN_SESSION_COOKIE = 'hengbeger_admin_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;
const TEST_ADMIN_PASSWORD = 'TestAdminPassword!1';
const TEST_AUTH_SECRET = 'test-auth-secret';
const PASSWORD_KDF_SALT = 'hengbeger-admin-login-v1';
const MAX_PASSWORD_LENGTH = 512;
const COMPARE_HMAC_KEY = 'hengbeger-secure-compare-v1';
const revokedSessionJtis = new Map();

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

  const leftDigest = crypto.createHmac('sha256', COMPARE_HMAC_KEY).update(String(left)).digest();
  const rightDigest = crypto.createHmac('sha256', COMPARE_HMAC_KEY).update(String(right)).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
};

const getAdminPassword = () => {
  if (process.env.NODE_ENV === 'test') {
    return TEST_ADMIN_PASSWORD;
  }

  return normalizeSecret(process.env.ADMIN_PASSWORD);
};

const getAuthSecret = () => {
  if (process.env.NODE_ENV === 'test') {
    return TEST_AUTH_SECRET;
  }

  return normalizeSecret(process.env.AUTH_SECRET);
};

const getAuthConfiguration = () => {
  const adminPassword = getAdminPassword();
  const authSecret = getAuthSecret();

  return {
    adminPassword,
    authSecret,
    configured: Boolean(adminPassword && authSecret),
  };
};

const derivePasswordDigest = (value) => crypto.scryptSync(value, PASSWORD_KDF_SALT, 64);

const verifyAdminPassword = (providedPassword) => {
  try {
    const expectedDigest = derivePasswordDigest(getAdminPassword());
    const providedDigest = derivePasswordDigest(providedPassword);
    return crypto.timingSafeEqual(providedDigest, expectedDigest);
  } catch {
    return false;
  }
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
    jti: crypto.randomUUID(),
    issuedAt,
    expiresAt: issuedAt + SESSION_DURATION_MS,
  };
};

const isSessionRevoked = (payload) => {
  const jti = payload?.jti;
  if (!jti) {
    return true;
  }

  const expiresAt = revokedSessionJtis.get(jti);
  if (expiresAt === undefined) {
    return false;
  }

  if (expiresAt > Date.now()) {
    return true;
  }

  revokedSessionJtis.delete(jti);
  return false;
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
    if (isSessionRevoked(payload)) {
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

export const isAdminAuthenticated = (req) => (
  Boolean(getAdminSession(req) || getAdminSessionFromBearer(req))
);

export const getAdminAuthStatus = (req) => {
  const config = getAuthConfiguration();
  const session = req.adminSession || getAdminSession(req) || getAdminSessionFromBearer(req);

  return {
    configured: config.configured,
    authenticated: Boolean(session),
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
  const { authSecret, configured } = getAuthConfiguration();
  if (!configured) {
    next(new AppError('Admin authentication is not configured.', 503));
    return;
  }

  const password = normalizeSecret(req.body?.password);
  if (!password) {
    logAdminAudit(req, 'admin.session.login.failed', { reason: 'missing_password' });
    next(new AppError('Password is required.', 400));
    return;
  }

  if (password.length > MAX_PASSWORD_LENGTH || !verifyAdminPassword(password)) {
    logAdminAudit(req, 'admin.session.login.failed', { reason: 'invalid_password' });
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

export const clearAdminSession = (req, res) => {
  const session = req
    ? (req.adminSession || getAdminSession(req) || getAdminSessionFromBearer(req))
    : null;
  if (session?.jti && typeof session.expiresAt === 'number') {
    revokedSessionJtis.set(session.jti, session.expiresAt);
  }

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
