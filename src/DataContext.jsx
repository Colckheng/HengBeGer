import React, { createContext, useState, useContext, useEffect } from 'react';

// 创建数据上下文
const DataContext = createContext();

// API基础URL - 在开发环境中使用相对路径以利用Vite代理
const API_BASE_URL = import.meta.env.DEV ? '/api' : 'http://localhost:3001/api';

// API服务函数
const apiService = {
  // 获取所有数据
  fetchData: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/storage/data`);
      if (!response.ok) throw new Error('网络响应异常');
      const result = await response.json();
      if (result.success) {
        // 数据结构处理，提取实际的数据数组
        const flattenedData = {
          agents: result.data.agents?.data || [],
          soundEngines: result.data.soundEngines?.data || [],
          bumbos: result.data.bumbos?.data || [],
          driveDisks: result.data.driveDisks?.data || []
        };
        return flattenedData;
      } else {
        throw new Error(result.message || '获取数据失败');
      }
    } catch (error) {
      console.error('获取数据失败:', error);
      throw error;
    }
  },

  // 获取基础数据（factions、roles、rarities）
  fetchBaseData: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/base-data`);
      if (!response.ok) throw new Error('获取基础数据失败');
      return await response.json();
    } catch (error) {
      console.error('获取基础数据失败:', error);
      throw error;
    }
  },

  // 代理人相关API
  addAgent: async (agent) => {
    try {
      console.log('🚀 开始添加代理人请求');
      console.log('📤 请求URL:', `${API_BASE_URL}/agents`);
      console.log('📤 请求数据:', agent);
      
      const response = await fetch(`${API_BASE_URL}/agents`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(agent)
      });
      
      console.log('📥 响应状态:', response.status, response.statusText);
      console.log('📥 响应头:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ 响应错误内容:', errorText);
        throw new Error(`添加代理人失败: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('✅ 添加代理人成功:', result);
      return result;
    } catch (error) {
      console.error('❌ 添加代理人失败:', error);
      console.error('❌ 错误详情:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  },

  updateAgent: async (id, agent) => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent)
      });
      if (!response.ok) throw new Error('更新代理人失败');
      return await response.json();
    } catch (error) {
      console.error('更新代理人失败:', error);
      throw error;
    }
  },

  deleteAgent: async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('删除代理人失败');
      return true;
    } catch (error) {
      console.error('删除代理人失败:', error);
      throw error;
    }
  },

  // 音擎相关API
  addSoundEngine: async (engine) => {
    try {
      const response = await fetch(`${API_BASE_URL}/sound-engines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(engine)
      });
      if (!response.ok) throw new Error('添加音擎失败');
      return await response.json();
    } catch (error) {
      console.error('添加音擎失败:', error);
      throw error;
    }
  },

  updateSoundEngine: async (id, engine) => {
    try {
      const response = await fetch(`${API_BASE_URL}/sound-engines/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(engine)
      });
      if (!response.ok) throw new Error('更新音擎失败');
      return await response.json();
    } catch (error) {
      console.error('更新音擎失败:', error);
      throw error;
    }
  },

  deleteSoundEngine: async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/sound-engines/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('删除音擎失败');
      return true;
    } catch (error) {
      console.error('删除音擎失败:', error);
      throw error;
    }
  },

  // 邦布相关API
  addBumbo: async (bumbo) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bumbos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bumbo)
      });
      if (!response.ok) throw new Error('添加邦布失败');
      return await response.json();
    } catch (error) {
      console.error('添加邦布失败:', error);
      throw error;
    }
  },

  updateBumbo: async (id, bumbo) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bumbos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bumbo)
      });
      if (!response.ok) throw new Error('更新邦布失败');
      return await response.json();
    } catch (error) {
      console.error('更新邦布失败:', error);
      throw error;
    }
  },

  deleteBumbo: async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bumbos/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('删除邦布失败');
      return true;
    } catch (error) {
      console.error('删除邦布失败:', error);
      throw error;
    }
  },

  // 驱动盘相关API
  addDriveDisk: async (disk) => {
    try {
      const response = await fetch(`${API_BASE_URL}/drive-disks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(disk)
      });
      if (!response.ok) throw new Error('添加驱动盘失败');
      return await response.json();
    } catch (error) {
      console.error('添加驱动盘失败:', error);
      throw error;
    }
  },

  updateDriveDisk: async (id, disk) => {
    try {
      const response = await fetch(`${API_BASE_URL}/drive-disks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(disk)
      });
      if (!response.ok) throw new Error('更新驱动盘失败');
      return await response.json();
    } catch (error) {
      console.error('更新驱动盘失败:', error);
      throw error;
    }
  },

  deleteDriveDisk: async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/drive-disks/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('删除驱动盘失败');
      return true;
    } catch (error) {
      console.error('删除驱动盘失败:', error);
      throw error;
    }
  }
}

// 数据提供者组件
const DataProvider = ({ children }) => {
  const [data, setData] = useState({ agents: [], soundEngines: [], bumbos: [], driveDisks: [] });
  const [baseData, setBaseData] = useState({ factions: [], roles: [], rarities: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 初始化数据
  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        setError(null);
        // 同时加载主数据和基础数据
        const [mainData, baseDataResult] = await Promise.all([
          apiService.fetchData(),
          apiService.fetchBaseData()
        ]);
        setData(mainData);
        setBaseData(baseDataResult);
        setLoading(false);
      } catch (err) {
        setError('加载数据失败: ' + err.message);
        setLoading(false);
      }
    };

    initData();
  }, []);

  // 刷新数据（从API重新加载）
  const refreshData = async () => {
    try {
      setLoading(true);
      setError(null);
      // 同时刷新主数据和基础数据
      const [mainData, baseDataResult] = await Promise.all([
        apiService.fetchData(),
        apiService.fetchBaseData()
      ]);
      setData(mainData);
      setBaseData(baseDataResult);
      setLoading(false);
    } catch (err) {
      setError('刷新数据失败: ' + err.message);
      setLoading(false);
    }
  };

  // 特定类型的CRUD函数 - 这些函数会调用API并刷新本地状态
  const handleAddAgent = async (agent) => {
    try {
      await apiService.addAgent(agent);
      await refreshData();
    } catch (err) {
      setError('添加代理人失败: ' + err.message);
      throw err; // 重新抛出错误以便AdminPanel可以捕获
    }
  };

  const handleUpdateAgent = async (id, agent) => {
    try {
      await apiService.updateAgent(id, agent);
      await refreshData();
    } catch (err) {
      setError('更新代理人失败: ' + err.message);
      throw err;
    }
  };

  const handleDeleteAgent = async (id) => {
    try {
      await apiService.deleteAgent(id);
      await refreshData();
    } catch (err) {
      setError('删除代理人失败: ' + err.message);
      throw err;
    }
  };

  const handleAddSoundEngine = async (engine) => {
    try {
      await apiService.addSoundEngine(engine);
      await refreshData();
    } catch (err) {
      setError('添加音擎失败: ' + err.message);
      throw err;
    }
  };

  const handleUpdateSoundEngine = async (id, engine) => {
    try {
      await apiService.updateSoundEngine(id, engine);
      await refreshData();
    } catch (err) {
      setError('更新音擎失败: ' + err.message);
      throw err;
    }
  };

  const handleDeleteSoundEngine = async (id) => {
    try {
      await apiService.deleteSoundEngine(id);
      await refreshData();
    } catch (err) {
      setError('删除音擎失败: ' + err.message);
      throw err;
    }
  };

  const handleAddBumbo = async (bumbo) => {
    try {
      await apiService.addBumbo(bumbo);
      await refreshData();
    } catch (err) {
      setError('添加邦布失败: ' + err.message);
      throw err;
    }
  };

  const handleUpdateBumbo = async (id, bumbo) => {
    try {
      await apiService.updateBumbo(id, bumbo);
      await refreshData();
    } catch (err) {
      setError('更新邦布失败: ' + err.message);
      throw err;
    }
  };

  const handleDeleteBumbo = async (id) => {
    try {
      await apiService.deleteBumbo(id);
      await refreshData();
    } catch (err) {
      setError('删除邦布失败: ' + err.message);
      throw err;
    }
  };

  const handleAddDriveDisk = async (disk) => {
    try {
      await apiService.addDriveDisk(disk);
      await refreshData();
    } catch (err) {
      setError('添加驱动盘失败: ' + err.message);
      throw err;
    }
  };

  const handleUpdateDriveDisk = async (id, disk) => {
    try {
      await apiService.updateDriveDisk(id, disk);
      await refreshData();
    } catch (err) {
      setError('更新驱动盘失败: ' + err.message);
      throw err;
    }
  };

  const handleDeleteDriveDisk = async (id) => {
    try {
      await apiService.deleteDriveDisk(id);
      await refreshData();
    } catch (err) {
      setError('删除驱动盘失败: ' + err.message);
      throw err;
    }
  };

  // 管理员界面点击更新数据时调用
  const handleUpdateData = async () => {
    await refreshData();
  };


  const contextValue = {
    data,
    baseData,
    loading,
    error,
    handleAddAgent,
    handleUpdateAgent,
    handleDeleteAgent,
    handleAddSoundEngine,
    handleUpdateSoundEngine,
    handleDeleteSoundEngine,
    handleAddBumbo,
    handleUpdateBumbo,
    handleDeleteBumbo,
    handleAddDriveDisk,
    handleUpdateDriveDisk,
    handleDeleteDriveDisk,
    handleUpdateData,
    refreshData
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

// 自定义钩子，用于访问数据上下文
export const useDataContext = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
};

// 为了向后兼容，导出useData别名
export const useData = useDataContext;

export { DataProvider };

export default useDataContext;