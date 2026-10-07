import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPublicList } from '../api/publicLists.js';
import { usePaginatedPublicList } from './usePaginatedPublicList.js';

vi.mock('../api/publicLists.js', () => ({
  DEFAULT_PUBLIC_PAGE_SIZE: 20,
  fetchPublicList: vi.fn(),
}));

const basePage = {
  items: [{ id: 1, name: 'Anby' }],
  total: 1,
  hasMore: false,
};

describe('usePaginatedPublicList retry', () => {
  beforeEach(() => {
    fetchPublicList.mockReset();
  });

  it('keeps items when a refresh fails and clears the error on retry', async () => {
    fetchPublicList
      .mockResolvedValueOnce({ ...basePage, hasMore: true })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ...basePage, items: [{ id: 1, name: 'Anby' }, { id: 2, name: 'Billy' }], total: 2 });

    const { result } = renderHook(() => usePaginatedPublicList({ endpoint: '/agents/list' }));

    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      result.current.nextPage();
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.error).toBe(''));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });
});
