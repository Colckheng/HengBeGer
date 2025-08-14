import './App.css'
import { Routes, Route, Link } from 'react-router-dom'
import zzz from './assets/zzz.jpg'
import star from './assets/star.jpg'
import mc from './assets/mc.jpg'
import ZZZWiki from './ZZZWiki.jsx'
import AdminPanel from './AdminPanel.jsx'
import { useParams } from 'react-router-dom'

// 代理人详情页面包装组件
const AgentDetailWrapper = () => {
  const { id } = useParams();
  // 这里应该从数据中获取对应的代理人
  // 实际应用中，可能需要使用Context或Redux来管理数据
  return <ZZZWiki mode="detail" agentId={id} />
}

function App() {
  return (
    <div className="game-container">
      <Routes>
        <Route path="/" element={(
          <>
            <Link to="/" className="home-link"><h1>HengBeGer</h1></Link>
            <div className="game-options">
              <div className="game-card">
                <Link to="/zzz-wiki" className="game-link">
                  <h2>绝区零</h2>
                  <div className="game-image-placeholder" style={{backgroundColor: 'rgb(11, 11, 11)'}}>
                    <img src={zzz} alt="绝区零" className="placeholder-logo" />
                  </div>
                </Link>
              </div>
              <div className="game-card">
                <h2>崩坏：星穹铁道</h2>
                <div className="game-image-placeholder" style={{backgroundColor: 'rgb(11, 11, 11)'}}>
                  <img src={star} alt="崩坏：星穹铁道" className="placeholder-logo" />
                </div>
              </div>
              <div className="game-card">
                <h2>鸣潮</h2>
                <div className="game-image-placeholder" style={{backgroundColor: 'rgb(11, 11, 11)'}}>
                  <img src={mc} alt="鸣潮" className="placeholder-logo" />
                </div>
              </div>
            </div>
          </>
        )} />
        <Route path="/zzz-wiki" element={<ZZZWiki />} />
        <Route path="/zzz-wiki/agent/:id" element={<AgentDetailWrapper />} />
        <Route path="/zzz-wiki/admin" element={<AdminPanel />} />
      </Routes>
    </div>
  )
}

export default App
