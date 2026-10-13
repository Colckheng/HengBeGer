import {lazy, Suspense} from 'react';

const Reader = lazy(() => import('./Reader.jsx'));

export default function ReaderLoader(props) {
  return <Suspense fallback={<div className="reader-loading" role="status">正在展开章节…</div>}><Reader {...props}/></Suspense>;
}
