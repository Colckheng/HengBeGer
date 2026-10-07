import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient from './api/client.js';
import { DataProvider, useData } from './DataContext.jsx';
import { useLocation } from 'react-router-dom';

vi.mock('react-router-dom', () => ({ useLocation: vi.fn() }));
vi.mock('./api/client.js', () => ({ default: { get: vi.fn() } }));

const pathnameRef = { current: '/' };
let latest;

const Probe = () => {
  latest = useData();
  return null;
};

const MAIN_PAYLOAD = {
  data: {
    data: {
      agents: [{ id: 1, name: 'Anby' }],
      soundEngines: [],
      bumbos: [],
      driveDisks: [],
      hsrCharacters: [],
      hsrCones: [],
      hsrRelics: [],
    },
  },
};

const respond = () => {
  apiClient.get.mockImplementation((url) => {
    if (url === '/dual-storage/web/data') {
      return Promise.resolve(MAIN_PAYLOAD);
    }
    if (url === '/base-data') {
      return Promise.resolve({ data: { factions: [{ id: 1, name: '狡兔屋' }], roles: [], rarities: [] } });
    }
    return Promise.resolve({
      data: { elements: [], paths: [], rarities: [], relicTypes: [], relicParts: [] },
    });
  });
};

const countCalls = (url) => apiClient.get.mock.calls.filter(([calledUrl]) => calledUrl === url).length;

const renderProvider = () => render(
  <DataProvider>
    <Probe />
  </DataProvider>,
);

describe('DataProvider route loading', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    latest = undefined;
    pathnameRef.current = '/';
    useLocation.mockImplementation(() => ({ pathname: pathnameRef.current }));
  });

  it('loads base data on first mount and leaves main data untouched on non-prefetch routes', async () => {
    respond();
    const { rerender } = renderProvider();

    await waitFor(() => expect(latest.loading).toBe(false));
    expect(countCalls('/base-data')).toBe(1);
    expect(countCalls('/dual-storage/web/data')).toBe(0);
    expect(latest.data.agents).toEqual([]);

    pathnameRef.current = '/zzz-wiki';
    rerender(
      <DataProvider>
        <Probe />
      </DataProvider>,
    );

    await waitFor(() => expect(latest.loading).toBe(false));
    expect(latest.loading).toBe(false);
    expect(countCalls('/base-data')).toBe(1);
    expect(countCalls('/dual-storage/web/data')).toBe(0);
  });

  it('caches base data and prefetches main data on prefetch routes', async () => {
    respond();
    const { rerender } = renderProvider();
    await waitFor(() => expect(latest.loading).toBe(false));

    pathnameRef.current = '/zzz-wiki/admin';
    rerender(
      <DataProvider>
        <Probe />
      </DataProvider>,
    );

    await waitFor(() => expect(latest.data.agents).toHaveLength(1));
    expect(latest.loading).toBe(false);
    expect(countCalls('/base-data')).toBe(1);
    expect(countCalls('/dual-storage/web/data')).toBe(1);
  });

  it('keeps previously loaded data when navigating away from a prefetch route', async () => {
    respond();
    const { rerender } = renderProvider();
    await waitFor(() => expect(latest.loading).toBe(false));

    pathnameRef.current = '/zzz-wiki/admin';
    rerender(
      <DataProvider>
        <Probe />
      </DataProvider>,
    );
    await waitFor(() => expect(latest.data.agents).toHaveLength(1));

    pathnameRef.current = '/';
    rerender(
      <DataProvider>
        <Probe />
      </DataProvider>,
    );

    expect(latest.loading).toBe(false);
    expect(latest.data.agents).toHaveLength(1);
    expect(latest.error).toBeNull();
  });

  it('aborts an in-flight prefetch when the route changes again', async () => {
    const signals = [];
    apiClient.get.mockImplementation((url, config) => {
      if (url === '/dual-storage/web/data') {
        signals.push(config.signal);
        return new Promise(() => {});
      }
      if (url === '/base-data') {
        return Promise.resolve({ data: { factions: [], roles: [], rarities: [] } });
      }
      return Promise.resolve({ data: { elements: [], paths: [], rarities: [], relicTypes: [], relicParts: [] } });
    });

    const { rerender } = renderProvider();
    await waitFor(() => expect(latest.loading).toBe(false));

    pathnameRef.current = '/zzz-wiki/admin';
    rerender(
      <DataProvider>
        <Probe />
      </DataProvider>,
    );
    await waitFor(() => expect(signals).toHaveLength(1));

    pathnameRef.current = '/';
    rerender(
      <DataProvider>
        <Probe />
      </DataProvider>,
    );

    await waitFor(() => expect(signals[0].aborted).toBe(true));
  });

  it('exposes an error after a failed initial load instead of loading forever', async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === '/base-data' || url === '/hsr/base-data') {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ data: { elements: [], paths: [], rarities: [], relicTypes: [], relicParts: [] } });
    });

    renderProvider();

    await waitFor(() => expect(latest.error).toBeTruthy());
    expect(latest.loading).toBe(false);
  });
});
