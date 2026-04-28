import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getStoredAdminSessionToken,
  setStoredAdminSessionToken,
} from '../api/adminSession.js';
import apiClient from '../api/client.js';
import AdminAuthGate from './AdminAuthGate.jsx';

vi.mock('../api/client.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const LOGIN_TITLE = '\u7ba1\u7406\u5458\u767b\u5f55';

describe('AdminAuthGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the login form and clears stale stored tokens when the admin is not authenticated', async () => {
    setStoredAdminSessionToken('stale-token');
    apiClient.get.mockResolvedValue({
      data: {
        configured: true,
        authenticated: false,
      },
    });

    render(
      <AdminAuthGate>
        <div>secret content</div>
      </AdminAuthGate>,
    );

    expect(await screen.findByText(LOGIN_TITLE)).toBeTruthy();
    expect(screen.queryByText('secret content')).toBeNull();
    expect(getStoredAdminSessionToken()).toBe('');
  });

  it('renders children when the admin session is already authenticated', async () => {
    apiClient.get.mockResolvedValue({
      data: {
        configured: true,
        authenticated: true,
      },
    });

    render(
      <AdminAuthGate>
        <div>secret content</div>
      </AdminAuthGate>,
    );

    expect(await screen.findByText('secret content')).toBeTruthy();
  });

  it('stores the signed session token after a successful login', async () => {
    apiClient.get
      .mockResolvedValueOnce({
        data: {
          configured: true,
          authenticated: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          configured: true,
          authenticated: true,
          expiresAt: 123456,
        },
      });
    apiClient.post.mockResolvedValue({
      data: {
        sessionToken: 'signed-session-token',
      },
    });

    render(
      <AdminAuthGate>
        <div>secret content</div>
      </AdminAuthGate>,
    );

    expect(await screen.findByText(LOGIN_TITLE)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('管理员密码'), {
      target: { value: 'super-secret-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('secret content')).toBeTruthy();
    expect(apiClient.post).toHaveBeenCalledWith('/auth/session', {
      password: 'super-secret-password',
    });
    expect(getStoredAdminSessionToken()).toBe('signed-session-token');
  });

  it('clears the stored session token and shows the backend message when login fails', async () => {
    setStoredAdminSessionToken('stale-token');
    apiClient.get.mockResolvedValue({
      data: {
        configured: true,
        authenticated: false,
      },
    });
    apiClient.post.mockRejectedValue({
      response: {
        data: {
          message: 'Invalid admin password.',
        },
      },
    });

    render(
      <AdminAuthGate>
        <div>secret content</div>
      </AdminAuthGate>,
    );

    expect(await screen.findByText(LOGIN_TITLE)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('管理员密码'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('Invalid admin password.')).toBeTruthy();
    expect(getStoredAdminSessionToken()).toBe('');
    expect(screen.queryByText('secret content')).toBeNull();
  });

  it('shows backend error payloads that only include the error field', async () => {
    apiClient.get.mockRejectedValue({
      response: {
        data: {
          error: 'Session unavailable.',
        },
      },
    });

    render(
      <AdminAuthGate>
        <div>secret content</div>
      </AdminAuthGate>,
    );

    expect(await screen.findByText('Session unavailable.')).toBeTruthy();
  });
});
