import { logAudit } from './logger.js';

const getAuthMode = (req) => (
  req?.get?.('authorization')?.startsWith('Bearer ') ? 'bearer' : 'cookie'
);

export const buildAdminAuditContext = (req, details = {}) => ({
  actor: 'admin',
  authMode: getAuthMode(req),
  method: req?.method || '',
  path: req?.path || '',
  requestId: req?.requestId || '',
  ip: req?.ip || '',
  ...details,
});

export const logAdminAudit = (req, event, details = {}) => {
  logAudit(event, buildAdminAuditContext(req, details));
};

export default logAdminAudit;
