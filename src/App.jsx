import { useEffect } from 'react';
import { Route, Routes, useLocation, useParams } from 'react-router-dom';

import './App.css';
import './ZZZWiki.css';
import AdminPanel from './AdminPanel.jsx';
import AdminAuthGate from './components/AdminAuthGate.jsx';
import AppErrorBoundary from './AppErrorBoundary.jsx';
import SiteToolbar from './components/SiteToolbar.jsx';
import DataTest from './DataTest.jsx';
import HomePage from './HomePage.jsx';
import HsrAdminPanel from './hsr/HsrAdminPanel.jsx';
import HsrWiki from './hsr/HsrWiki.jsx';
import NotFound from './NotFound.jsx';
import ZZZWiki from './ZZZWiki.jsx';

const AgentDetailWrapper = () => {
  const { id } = useParams();
  return <ZZZWiki mode="detail" agentId={id} />;
};

const tintOf = (pathname) => {
  if (pathname.startsWith('/zzz-wiki')) return 'zzz';
  if (pathname.startsWith('/hsr-wiki')) return 'hsr';
  return 'neutral';
};

function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.dataset.tint = tintOf(pathname);
  }, [pathname]);

  return (
    <div className="game-container">
      <SiteToolbar />
      <div className="site-main">
        <AppErrorBoundary key={pathname}>
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
            {import.meta.env.DEV && <Route path="/data-test" element={<DataTest />} />}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppErrorBoundary>
      </div>
    </div>
  );
}

export default App;
