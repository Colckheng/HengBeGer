import { describe, expect, it, vi } from 'vitest';

import { logoutAdminSession } from './adminLogout.js';

describe('logoutAdminSession', () => {
  it('logs out on the server and clears the local session state', async () => {
    const client = {
      delete: vi.fn().mockResolvedValue({}),
    };
    const clearToken = vi.fn();
    const reload = vi.fn();

    const result = await logoutAdminSession({
      client,
      clearToken,
      reload,
    });

    expect(result).toBe(true);
    expect(client.delete).toHaveBeenCalledWith('/auth/session');
    expect(clearToken).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still clears local session state when the server logout request fails', async () => {
    const client = {
      delete: vi.fn().mockRejectedValue(new Error('network down')),
    };
    const clearToken = vi.fn();
    const reload = vi.fn();

    const result = await logoutAdminSession({
      client,
      clearToken,
      reload,
    });

    expect(result).toBe(false);
    expect(client.delete).toHaveBeenCalledWith('/auth/session');
    expect(clearToken).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
