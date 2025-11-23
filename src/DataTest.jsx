import React from 'react';
import { useData } from './DataContext';

const DataTest = () => {
  const { data, loading, error } = useData();

  console.log('DataTest - data:', data);
  console.log('DataTest - loading:', loading);
  console.log('DataTest - error:', error);

  if (loading) {
    return <div style={{ color: 'white', padding: '20px' }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>;
  }

  return (
    <div style={{ color: 'white', padding: '20px' }}>
      <h2>Data Test Component</h2>
      <div>
        <h3>Agents: {data?.agents?.length || 0}</h3>
        <h3>Sound Engines: {data?.soundEngines?.length || 0}</h3>
        <h3>Bumbos: {data?.bumbos?.length || 0}</h3>
        <h3>Drive Disks: {data?.driveDisks?.length || 0}</h3>
      </div>
      <div>
        <h3>Raw Data:</h3>
        <pre style={{ background: '#333', padding: '10px', fontSize: '12px' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default DataTest;