import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle.jsx';

const contextOf = (pathname) => {
  if (pathname.startsWith('/zzz-wiki')) return 'zzz';
  if (pathname.startsWith('/hsr-wiki')) return 'hsr';
  return 'neutral';
};

export default function SiteToolbar() {
  const { pathname } = useLocation();
  const context = contextOf(pathname);
  const isAgentDetail = pathname.startsWith('/zzz-wiki/agent/');
  const isAdmin = pathname.endsWith('/admin');
  const adminTo = context === 'hsr' ? '/hsr-wiki/admin' : '/zzz-wiki/admin';

  return (
    <div className="toolbar-rail">
      <header className="site-toolbar">
        <Link to="/" className="site-brand">
          <span className="site-brand-dot" aria-hidden="true" />
          <span className="site-brand-name">HengBeGer</span>
        </Link>

        <div className="site-toolbar-actions">
          {isAgentDetail && (
            <Link to="/zzz-wiki" className="toolbar-btn toolbar-back">
              <span aria-hidden="true">‹</span> 返回列表
            </Link>
          )}

          <div className="toolbar-switch" role="navigation" aria-label="切换游戏">
            <Link
              to="/zzz-wiki"
              className={`toolbar-switch-item${context === 'zzz' ? ' is-active' : ''}`}
            >
              ZZZ
            </Link>
            <Link
              to="/hsr-wiki"
              className={`toolbar-switch-item${context === 'hsr' ? ' is-active' : ''}`}
            >
              HSR
            </Link>
          </div>

          {!isAdmin && (
            <Link to={adminTo} className="toolbar-btn toolbar-admin">
              内容后台
            </Link>
          )}

          <ThemeToggle />
        </div>
      </header>
    </div>
  );
}
