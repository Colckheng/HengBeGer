import React from 'react';
import {createRoot} from 'react-dom/client';
import DemoApp from './DemoApp.jsx';
import './fonts.css';
import './edition-fonts.css';
import './demo-v3.css';
import './demo-refinement.css';
import './ink-edition.css';
import './atlas-edition.css';
import './atlas-collection.css';
import './atlas-detail.css';

class DemoBoundary extends React.Component {
  state={error:false};
  static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error?<main className="boot"><h1>这一页暂时没有展开</h1><p>请刷新重试，或返回设计总览。</p><a href="/demo.html">返回总览</a></main>:this.props.children;}
}
createRoot(document.getElementById('root')).render(<React.StrictMode><DemoBoundary><DemoApp/></DemoBoundary></React.StrictMode>);
