import { describe, expect, it, vi } from 'vitest';

const logAudit = vi.fn();

vi.mock('./logger.js', () => ({
  logAudit,
}));

const { buildAdminAuditContext, logAdminAudit } = await import('./adminAudit.js');

describe('adminAudit', () => {
  it('builds a structured admin audit context', () => {
    const req = {
      method: 'POST',
      path: '/api/agents',
      requestId: 'req-1',
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('Bearer signed-token'),
    };

    expect(buildAdminAuditContext(req, { entityId: 8 })).toEqual({
      actor: 'admin',
      authMode: 'bearer',
      method: 'POST',
      path: '/api/agents',
      requestId: 'req-1',
      ip: '127.0.0.1',
      entityId: 8,
    });
  });

  it('forwards the event and normalized context to the audit logger', () => {
    const req = {
      method: 'DELETE',
      path: '/api/agents/8',
      requestId: 'req-2',
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue(undefined),
    };

    logAdminAudit(req, 'agents.delete', { entityId: 8 });

    expect(logAudit).toHaveBeenCalledWith('agents.delete', {
      actor: 'admin',
      authMode: 'cookie',
      method: 'DELETE',
      path: '/api/agents/8',
      requestId: 'req-2',
      ip: '127.0.0.1',
      entityId: 8,
    });
  });
});
