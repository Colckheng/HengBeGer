import { Route, Routes, useParams } from 'react-router-dom';

import './App.css';
import './ZZZWiki.css';
import AdminPanel from './AdminPanel.jsx';
import AdminAuthGate from './components/AdminAuthGate.jsx';
import DataTest from './DataTest.jsx';
import HomePage from './HomePage.jsx';
import HsrAdminPanel from './hsr/HsrAdminPanel.jsx';
import HsrWiki from './hsr/HsrWiki.jsx';
import ZZZWiki from './ZZZWiki.jsx';

const AgentDetailWrapper = () => {
  const { id } = useParams();
  return <ZZZWiki mode="detail" agentId={id} />;
};

function App() {
  return (
    <div className="game-container">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/zzz-wiki" element={<ZZZWiki />} />
        <Route path="/zzz-wiki/agent/:id" element={<AgentDetailWrapper />} />
        <Route
          path="/zzz-wiki/admin"
          element={(
            <AdminAuthGate>
              <AdminPanel />
            </AdminAuthGate>
          )}
        />
        <Route path="/hsr-wiki" element={<HsrWiki />} />
        <Route
          path="/hsr-wiki/admin"
          element={(
            <AdminAuthGate>
              <HsrAdminPanel />
            </AdminAuthGate>
          )}
        />
        <Route path="/data-test" element={<DataTest />} />
      </Routes>
    </div>
  );
}

export default App;
