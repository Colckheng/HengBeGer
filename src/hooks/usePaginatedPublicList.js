import { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_PUBLIC_PAGE_SIZE, fetchPublicList } from '../api/publicLists.js';
import { getApiErrorMessage } from '../utils/apiError.js';

const EMPTY_STATE = {
  items: [],
  total: 0,
  error: '',
  loading: false,
};

export const usePaginatedPublicList = ({
  endpoint,
  filters = {},
  enabled = true,
  limit = DEFAULT_PUBLIC_PAGE_SIZE,
  resetKey = '',
  fallbackError = '\u52a0\u8f7d\u5217\u8868\u5931\u8d25\u3002',
}) => {
  const serializedFilters = useMemo(() => JSON.stringify(filters), [filters]);
  const [offset, setOffset] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const resetKeyRef = useRef(`${limit}|${serializedFilters}`);
  const [state, setState] = useState({
    ...EMPTY_STATE,
    loading: enabled,
  });

  useEffect(() => {
    setOffset(0);
  }, [limit, serializedFilters]);

  useEffect(() => {
    setOffset(0);
    setState((current) => (
      current.items.length === 0 && !current.error
        ? current
        : { ...EMPTY_STATE, loading: enabled }
    ));
  }, [endpoint, enabled, resetKey]);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY_STATE);
      return undefined;
    }

    const nextResetKey = `${limit}|${serializedFilters}`;
    if (offset !== 0 && nextResetKey !== resetKeyRef.current) {
      return undefined;
    }

    resetKeyRef.current = nextResetKey;

    let cancelled = false;
    setState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    const load = async () => {
      try {
        const page = await fetchPublicList(endpoint, {
          ...JSON.parse(serializedFilters),
          limit,
          offset,
        });

        if (!cancelled) {
          setState({
            ...page,
            loading: false,
            error: '',
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: getApiErrorMessage(loadError, fallbackError),
          }));
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [enabled, endpoint, fallbackError, limit, offset, retryToken, serializedFilters]);

  const totalPages = Math.max(1, Math.ceil((state.total || 0) / limit) || 1);
  const page = Math.floor(offset / limit) + 1;

  return {
    ...state,
    limit,
    offset,
    page,
    totalPages,
    canPrev: offset > 0,
    canNext: state.hasMore,
    nextPage: () => {
      if (state.hasMore) {
        setOffset((current) => current + limit);
      }
    },
    prevPage: () => {
      setOffset((current) => Math.max(0, current - limit));
    },
    goToPage: (nextPage) => {
      const normalizedPage = Math.max(1, Number(nextPage) || 1);
      setOffset((normalizedPage - 1) * limit);
    },
    retry: () => {
      setRetryToken((current) => current + 1);
    },
  };
};

export default usePaginatedPublicList;
