import { Link } from 'react-router-dom';

import mc from './assets/mc.jpg';
import star from './assets/star.jpg';
import zzz from './assets/zzz.jpg';

const HOME_ENTRIES = [
  {
    title: '绝区零',
    tag: 'ZZZ',
    copy: '角色、音擎、邦布和驱动盘统一收口到一套沉浸式资料界面。',
    image: zzz,
    link: '/zzz-wiki',
    action: '进入 ZZZ Wiki',
  },
  {
    title: '星穹铁道',
    tag: 'HSR',
    copy: '角色、光锥与遗器保留现有查询能力，同时切到新的世界观视觉语言。',
    image: star,
    link: '/hsr-wiki',
    action: '进入 HSR Wiki',
  },
  {
    title: '更多宇宙',
    tag: 'Soon',
    copy: '预留给下一套资料库与内容策展空间，保持统一的品牌入口感。',
    image: mc,
    link: null,
    action: '即将开放',
  },
];

const HomePage = () => (
  <main className="home-screen">
    <div className="home-frame">
      <section className="home-hero">
        <div className="home-panel">
          <div>
            <span className="home-kicker">Live Encyclopedia</span>
            <div className="home-copy">
              <h1 className="home-title">HengBeGer</h1>
              <p className="home-subtitle">
                双游戏资料站、统一后台、同步快照与分页查询全部收拢到同一套内容系统里。
              </p>
            </div>
            <div className="home-copy-grid">
              <div className="home-copy-item">
                <p className="home-copy-label">Public Wiki</p>
                <strong>面向玩家的资料入口</strong>
                <span>公开页已接入分页、筛选和更完整的世界观式布局。</span>
              </div>
              <div className="home-copy-item">
                <p className="home-copy-label">Admin Workflow</p>
                <strong>面向内容维护的后台</strong>
                <span>管理员登录、CRUD、同步、备份和审计链路已经闭环。</span>
              </div>
            </div>
            <div className="home-actions">
              <Link className="home-action" to="/zzz-wiki">先看 ZZZ</Link>
              <Link className="home-secondary-action" to="/hsr-wiki">进入 HSR</Link>
              <Link className="home-secondary-action" to="/zzz-wiki/admin">内容后台</Link>
            </div>
          </div>
          <div className="home-support">
            <span>公开资料与后台录入共用同一套真实数据源</span>
            <span className="home-support-line" />
          </div>
        </div>
        <div className="home-poster">
          <img src={zzz} alt="绝区零视觉背景" />
          <div className="home-poster-copy">
            <span className="home-kicker">Current Build</span>
            <h2>游戏资料站，不只是表格。</h2>
            <p>
              把 Pixso 视觉方向落在现有项目路由、分页接口和后台工作流上，让内容看起来像产品，而不是演示页。
            </p>
          </div>
        </div>
      </section>

      <section className="home-grid">
        {HOME_ENTRIES.map((entry) => {
          const content = (
            <div className="home-entry-content">
              <span className="home-entry-tag">{entry.tag}</span>
              <div>
                <h3>{entry.title}</h3>
                <p>{entry.copy}</p>
                <span className="home-entry-link">{entry.action}</span>
              </div>
            </div>
          );

          if (!entry.link) {
            return (
              <article key={entry.title} className="home-entry disabled">
                <img src={entry.image} alt={entry.title} />
                {content}
              </article>
            );
          }

          return (
            <Link key={entry.title} className="home-entry" to={entry.link}>
              <img src={entry.image} alt={entry.title} />
              {content}
            </Link>
          );
        })}
      </section>
    </div>
  </main>
);

export default HomePage;
