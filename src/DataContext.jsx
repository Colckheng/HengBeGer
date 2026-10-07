import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';

import apiClient from './api/client.js';
import { getApiErrorMessage } from './utils/apiError.js';

const DataContext = createContext(undefined);

const ERROR_MESSAGES = {
  loadData: '\u52a0\u8f7d\u6570\u636e\u5931\u8d25\u3002',
  addAgent: '\u6dfb\u52a0\u4ee3\u7406\u4eba\u5931\u8d25\u3002',
  updateAgent: '\u66f4\u65b0\u4ee3\u7406\u4eba\u5931\u8d25\u3002',
  deleteAgent: '\u5220\u9664\u4ee3\u7406\u4eba\u5931\u8d25\u3002',
  addSoundEngine: '\u6dfb\u52a0\u97f3\u64ce\u5931\u8d25\u3002',
  updateSoundEngine: '\u66f4\u65b0\u97f3\u64ce\u5931\u8d25\u3002',
  deleteSoundEngine: '\u5220\u9664\u97f3\u64ce\u5931\u8d25\u3002',
  addBumbo: '\u6dfb\u52a0\u90a6\u5e03\u5931\u8d25\u3002',
  updateBumbo: '\u66f4\u65b0\u90a6\u5e03\u5931\u8d25\u3002',
  deleteBumbo: '\u5220\u9664\u90a6\u5e03\u5931\u8d25\u3002',
  addDriveDisk: '\u6dfb\u52a0\u9a71\u52a8\u76d8\u5931\u8d25\u3002',
  updateDriveDisk: '\u66f4\u65b0\u9a71\u52a8\u76d8\u5931\u8d25\u3002',
  deleteDriveDisk: '\u5220\u9664\u9a71\u52a8\u76d8\u5931\u8d25\u3002',
  addHsrCharacter: '\u6dfb\u52a0\u89d2\u8272\u5931\u8d25\u3002',
  updateHsrCharacter: '\u66f4\u65b0\u89d2\u8272\u5931\u8d25\u3002',
  deleteHsrCharacter: '\u5220\u9664\u89d2\u8272\u5931\u8d25\u3002',
  addHsrCone: '\u6dfb\u52a0\u5149\u9525\u5931\u8d25\u3002',
  updateHsrCone: '\u66f4\u65b0\u5149\u9525\u5931\u8d25\u3002',
  deleteHsrCone: '\u5220\u9664\u5149\u9525\u5931\u8d25\u3002',
  addHsrRelic: '\u6dfb\u52a0\u9057\u5668\u5931\u8d25\u3002',
  updateHsrRelic: '\u66f4\u65b0\u9057\u5668\u5931\u8d25\u3002',
  deleteHsrRelic: '\u5220\u9664\u9057\u5668\u5931\u8d25\u3002',
};

const createEmptyData = () => ({
  agents: [],
  soundEngines: [],
  bumbos: [],
  driveDisks: [],
  hsrCharacters: [],
  hsrCones: [],
  hsrRelics: [],
});

const createEmptyBaseData = () => ({
  factions: [],
  roles: [],
  rarities: [],
  hsr: {
    elements: [],
    paths: [],
    rarities: [],
    relicTypes: [],
    relicParts: [],
  },
});

const normalizeCollection = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object' && Array.isArray(value.data)) {
    return value.data;
  }

  return [];
};

const shouldPrefetchMainData = (pathname = '') => (
  pathname.startsWith('/zzz-wiki/admin')
  || pathname.startsWith('/hsr-wiki/admin')
  || pathname.startsWith('/zzz-wiki/agent/')
  || pathname.startsWith('/data-test')
);

const fetchMainData = async (signal) => {
  const response = await apiClient.get('/dual-storage/web/data', { signal });
  const payload = response.data?.data || {};

  return {
    agents: normalizeCollection(payload.agents),
    soundEngines: normalizeCollection(payload.soundEngines),
    bumbos: normalizeCollection(payload.bumbos),
    driveDisks: normalizeCollection(payload.driveDisks),
    hsrCharacters: normalizeCollection(payload.hsrCharacters),
    hsrCones: normalizeCollection(payload.hsrCones),
    hsrRelics: normalizeCollection(payload.hsrRelics),
  };
};

const fetchBaseData = async (signal) => {
  const [zzzResult, hsrResult] = await Promise.allSettled([
    apiClient.get('/base-data', { signal }),
    apiClient.get('/hsr/base-data', { signal }),
  ]);

  if (zzzResult.status === 'rejected' && hsrResult.status === 'rejected') {
    if (isAbortError(zzzResult.reason) || isAbortError(hsrResult.reason)) {
      throw zzzResult.reason;
    }
    console.warn('Base data load failed on both sides', zzzResult.reason, hsrResult.reason);
    throw zzzResult.reason;
  }

  if (zzzResult.status === 'rejected') {
    if (!isAbortError(zzzResult.reason)) {
      console.warn('ZZZ base data load failed, degrading to empty', zzzResult.reason);
    } else {
      throw zzzResult.reason;
    }
  }
  if (hsrResult.status === 'rejected') {
    if (!isAbortError(hsrResult.reason)) {
      console.warn('HSR base data load failed, degrading to empty', hsrResult.reason);
    } else {
      throw hsrResult.reason;
    }
  }

  const zzzResponse = zzzResult.status === 'fulfilled' ? zzzResult.value : null;
  const hsrResponse = hsrResult.status === 'fulfilled' ? hsrResult.value : null;
  const degraded = !zzzResponse || !hsrResponse;

  return {
    degraded,
    base: {
      factions: Array.isArray(zzzResponse?.data?.factions) ? zzzResponse.data.factions : [],
      roles: Array.isArray(zzzResponse?.data?.roles) ? zzzResponse.data.roles : [],
      rarities: Array.isArray(zzzResponse?.data?.rarities) ? zzzResponse.data.rarities : [],
      hsr: {
        elements: Array.isArray(hsrResponse?.data?.elements) ? hsrResponse.data.elements : [],
        paths: Array.isArray(hsrResponse?.data?.paths) ? hsrResponse.data.paths : [],
        rarities: Array.isArray(hsrResponse?.data?.rarities) ? hsrResponse.data.rarities : [],
        relicTypes: Array.isArray(hsrResponse?.data?.relicTypes) ? hsrResponse.data.relicTypes : [],
        relicParts: Array.isArray(hsrResponse?.data?.relicParts) ? hsrResponse.data.relicParts : [],
      },
    },
  };
};

const isAbortError = (loadError) => (
  loadError?.code === 'ERR_CANCELED'
  || loadError?.name === 'CanceledError'
  || loadError?.name === 'AbortError'
);

const DataProvider = ({ children }) => {
  const { pathname } = useLocation();
  const [data, setData] = useState(createEmptyData);
  const [baseData, setBaseData] = useState(createEmptyBaseData);
  const [baseDataDegraded, setBaseDataDegraded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const dataRef = useRef(data);
  const baseDataRef = useRef(null);
  const refreshSeqRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const loadAllData = async () => {
    const seq = refreshSeqRef.current + 1;
    refreshSeqRef.current = seq;

    const [mainData, { base, degraded }] = await Promise.all([
      fetchMainData(),
      fetchBaseData(),
    ]);

    if (seq !== refreshSeqRef.current) {
      return;
    }

    setData(mainData);
    setBaseData(base);
    setBaseDataDegraded(degraded);
    baseDataRef.current = degraded ? null : base;
  };

  const refreshData = async () => {
    setLoading(true);
    setError(null);
    baseDataRef.current = null;

    try {
      await loadAllData();
    } catch (refreshError) {
      setError(getApiErrorMessage(refreshError, ERROR_MESSAGES.loadData));
      throw refreshError;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadForRoute = async () => {
      const prefetchMain = shouldPrefetchMainData(pathname);
      if (prefetchMain && dataRef.current.agents.length === 0) {
        setLoading(true);
      }
      setError(null);

      try {
        if (!baseDataRef.current) {
          const { base, degraded } = await fetchBaseData(controller.signal);
          if (cancelled) {
            return;
          }

          setBaseData(base);
          setBaseDataDegraded(degraded);
          if (!degraded) {
            baseDataRef.current = base;
          }
        }

        if (prefetchMain) {
          const seq = refreshSeqRef.current + 1;
          refreshSeqRef.current = seq;
          const mainData = await fetchMainData(controller.signal);
          if (cancelled || seq !== refreshSeqRef.current) {
            return;
          }

          setData(mainData);
        }
      } catch (loadError) {
        if (!cancelled && !isAbortError(loadError)) {
          setError(getApiErrorMessage(loadError, ERROR_MESSAGES.loadData));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadForRoute();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pathname]);

  const mutateAndRefresh = async (request, fallbackMessage) => {
    let result;

    try {
      result = await request();
    } catch (mutationError) {
      setError(getApiErrorMessage(mutationError, fallbackMessage));
      throw mutationError;
    }

    setError(null);
    setRefreshing(true);

    try {
      await loadAllData();
    } catch (refreshError) {
      console.warn('Data refresh failed after successful mutation', refreshError);
    } finally {
      setRefreshing(false);
    }

    return result?.data ?? result;
  };

  const contextValue = {
    data,
    baseData,
    baseDataDegraded,
    loading,
    refreshing,
    error,
    refreshData,
    handleUpdateData: refreshData,
    handleAddAgent: (payload) => mutateAndRefresh(
      () => apiClient.post('/agents', payload),
      ERROR_MESSAGES.addAgent,
    ),
    handleUpdateAgent: (id, payload) => mutateAndRefresh(
      () => apiClient.put(`/agents/${id}`, payload),
      ERROR_MESSAGES.updateAgent,
    ),
    handleDeleteAgent: (id) => mutateAndRefresh(
      () => apiClient.delete(`/agents/${id}`),
      ERROR_MESSAGES.deleteAgent,
    ),
    handleAddSoundEngine: (payload) => mutateAndRefresh(
      () => apiClient.post('/sound-engines', payload),
      ERROR_MESSAGES.addSoundEngine,
    ),
    handleUpdateSoundEngine: (id, payload) => mutateAndRefresh(
      () => apiClient.put(`/sound-engines/${id}`, payload),
      ERROR_MESSAGES.updateSoundEngine,
    ),
    handleDeleteSoundEngine: (id) => mutateAndRefresh(
      () => apiClient.delete(`/sound-engines/${id}`),
      ERROR_MESSAGES.deleteSoundEngine,
    ),
    handleAddBumbo: (payload) => mutateAndRefresh(
      () => apiClient.post('/bumbos', payload),
      ERROR_MESSAGES.addBumbo,
    ),
    handleUpdateBumbo: (id, payload) => mutateAndRefresh(
      () => apiClient.put(`/bumbos/${id}`, payload),
      ERROR_MESSAGES.updateBumbo,
    ),
    handleDeleteBumbo: (id) => mutateAndRefresh(
      () => apiClient.delete(`/bumbos/${id}`),
      ERROR_MESSAGES.deleteBumbo,
    ),
    handleAddDriveDisk: (payload) => mutateAndRefresh(
      () => apiClient.post('/drive-disks', payload),
      ERROR_MESSAGES.addDriveDisk,
    ),
    handleUpdateDriveDisk: (id, payload) => mutateAndRefresh(
      () => apiClient.put(`/drive-disks/${id}`, payload),
      ERROR_MESSAGES.updateDriveDisk,
    ),
    handleDeleteDriveDisk: (id) => mutateAndRefresh(
      () => apiClient.delete(`/drive-disks/${id}`),
      ERROR_MESSAGES.deleteDriveDisk,
    ),
    handleAddHsrCharacter: (payload) => mutateAndRefresh(
      () => apiClient.post('/hsr/characters', payload),
      ERROR_MESSAGES.addHsrCharacter,
    ),
    handleUpdateHsrCharacter: (id, payload) => mutateAndRefresh(
      () => apiClient.put(`/hsr/characters/${id}`, payload),
      ERROR_MESSAGES.updateHsrCharacter,
    ),
    handleDeleteHsrCharacter: (id) => mutateAndRefresh(
      () => apiClient.delete(`/hsr/characters/${id}`),
      ERROR_MESSAGES.deleteHsrCharacter,
    ),
    handleAddHsrCone: (payload) => mutateAndRefresh(
      () => apiClient.post('/hsr/cones', payload),
      ERROR_MESSAGES.addHsrCone,
    ),
    handleUpdateHsrCone: (id, payload) => mutateAndRefresh(
      () => apiClient.put(`/hsr/cones/${id}`, payload),
      ERROR_MESSAGES.updateHsrCone,
    ),
    handleDeleteHsrCone: (id) => mutateAndRefresh(
      () => apiClient.delete(`/hsr/cones/${id}`),
      ERROR_MESSAGES.deleteHsrCone,
    ),
    handleAddHsrRelic: (payload) => mutateAndRefresh(
      () => apiClient.post('/hsr/relics', payload),
      ERROR_MESSAGES.addHsrRelic,
    ),
    handleUpdateHsrRelic: (id, payload) => mutateAndRefresh(
      () => apiClient.put(`/hsr/relics/${id}`, payload),
      ERROR_MESSAGES.updateHsrRelic,
    ),
    handleDeleteHsrRelic: (id) => mutateAndRefresh(
      () => apiClient.delete(`/hsr/relics/${id}`),
      ERROR_MESSAGES.deleteHsrRelic,
    ),
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

export const useDataContext = () => {
  const context = useContext(DataContext);

  if (!context) {
    throw new Error('useDataContext must be used within a DataProvider');
  }

  return context;
};

export const useData = useDataContext;

export { DataProvider };

export default useDataContext;
