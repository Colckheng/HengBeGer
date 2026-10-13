import {useEffect, useState} from 'react';
import {href, routeFromHash} from '../demo/model.js';
import {THEME} from './copy.js';

// The archive lives on one production route. Inside it the demo's hash grammar is
// reused unchanged, so the shared Atlas components, return links and scroll
// restoration keep behaving exactly as the reviewed design.
export const INDEX_PATH = '/index';
export const INDEX_URL = '/api/catalog/index';

// The archive is the product entry point: it answers on "/" and keeps "/index"
// as an alias so links written before the switch keep working. Inside the route
// the demo's hash grammar (#/orbital?...) is honoured unchanged, which also makes
// the reviewed demo preview links (/#/orbital?view=...) land on the real page.
export function isIndexPath(pathname) {
  return pathname === '/' || pathname === INDEX_PATH || pathname === `${INDEX_PATH}/`;
}

export function pageParams() {
  return Object.fromEntries(routeFromHash().params);
}

export function pageHref(values = {}) {
  return href(THEME, values);
}

export function pageUrl(values = {}) {
  return `${INDEX_PATH}${pageHref(values)}`;
}

// /api/catalog/entry returns the cleaned body plus its "## " section split, i.e.
// exactly what the reviewed design renders; /api/catalog/entry/raw keeps the stored
// payload verbatim for debugging.
export function entryUrl(key) {
  return `/api/catalog/entry?key=${encodeURIComponent(key)}`;
}

export function updatePage(route, changes) {
  window.location.hash = pageHref({...route, ...changes}).slice(1);
}

export function usePageRoute() {
  const [route, setRoute] = useState(pageParams);
  useEffect(() => {
    const change = () => setRoute(pageParams());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return route;
}
