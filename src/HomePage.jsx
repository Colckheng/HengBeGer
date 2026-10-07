import { Link } from 'react-router-dom';

const HOME_ENTRIES = [
  {
    title: '绝区零',
    tag: 'ZZZ',
    ctx: 'zzz',
    copy: '角色、音擎、邦布与驱动盘，按阵营、属性和职业自由组合筛选。',
    link: '/zzz-wiki',
    action: '进入 ZZZ Wiki',
  },
  {
    title: '星穹铁道',
    tag: 'HSR',
    ctx: 'hsr',
    copy: '角色、光锥与遗器，元素、命途和稀有度一次筛到位。',
    link: '/hsr-wiki',
    action: '进入 HSR Wiki',
  },
  {
    title: '更多游戏',
    tag: 'Soon',
    ctx: 'soon',
    copy: '预留给下一套资料库，保持统一的品牌入口与浏览体验。',
    link: null,
    action: '即将开放',
  },
];

const HomePage = () => (
  <main className="home-screen">
    <div className="home-frame">
      <section className="home-hero">
        <span className="wiki-kicker">Live Encyclopedia</span>
        <h1 className="home-title">双游戏资料站，一套内容系统。</h1>
        <p className="home-subtitle">
          绝区零与星穹铁道的资料查询，连同后台录入、同步快照与分页筛选，收拢在同一套界面里。
        </p>
      </section>

      <section className="home-grid">
        {HOME_ENTRIES.map((entry) => {
          const body = (
            <>
              <span className="home-entry-dot" aria-hidden="true" />
              <div className="home-entry-body">
                <div className="home-entry-head">
                  <h3>{entry.title}</h3>
                  <span className="home-entry-tag">{entry.tag}</span>
                </div>
                <p>{entry.copy}</p>
                <span className="home-entry-action">
                  {entry.action}
                  {entry.link ? (
                    <span className="home-entry-chev" aria-hidden="true">›</span>
                  ) : null}
                </span>
              </div>
            </>
          );

          if (!entry.link) {
            return (
              <article key={entry.title} className="home-entry is-disabled" data-ctx={entry.ctx}>
                {body}
              </article>
            );
          }

          return (
            <Link key={entry.title} className="home-entry" data-ctx={entry.ctx} to={entry.link}>
              {body}
            </Link>
          );
        })}
      </section>

      <footer className="home-footer">
        公开资料与后台录入共用同一套真实数据源
      </footer>
    </div>
  </main>
);

export default HomePage;
