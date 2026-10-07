import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AppErrorBoundary from './AppErrorBoundary.jsx';

afterEach(() => {
  cleanup();
});

const Bomb = () => {
  throw new Error('boom');
};

describe('AppErrorBoundary', () => {
  it('renders the fallback UI instead of unmounting the app when a child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('页面出错了')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy();

    consoleError.mockRestore();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <div>健康内容</div>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('健康内容')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
