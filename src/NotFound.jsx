import { Link } from 'react-router-dom';

import './App.css';

const NotFound = () => (
  <div className="not-found-panel">
    <p className="wiki-kicker">404</p>
    <h1>页面不存在</h1>
    <p>你访问的路径没有对应的页面。</p>
    <Link className="wiki-error-retry" to="/">
      返回首页
    </Link>
  </div>
);

export default NotFound;
