import {href} from './model.js';
import {THEMES} from './themes.js';

const themeIds=new Set(THEMES.map(theme=>theme.id));
const archiveViews=new Set(['home','list','world','season']);
const positionKey='hengberger:demo:source-positions';
const positions=new Map();

function parseArchiveHash(value){
  if(typeof value!=='string'||[...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))return null;
  const match=value.match(/^#\/([a-z]+)(?:\?([^#]*))?$/);
  if(!match||!themeIds.has(match[1]))return null;
  return {theme:match[1],params:new URLSearchParams(match[2]||'')};
}

// Return destinations are local archive routes only. Rebuild the query rather
// than accepting a URL, and never carry another detail or return destination.
export function safeReturnHref(value,theme){
  const parsed=parseArchiveHash(value);
  if(!parsed||parsed.params.has('entry')||!themeIds.has(theme))return null;
  if(!archiveViews.has(parsed.params.get('view')||'home'))return null;
  const values={};
  for(const [key,value] of parsed.params){
    if(['view','category','scope','q','filter','value','page','sort','order'].includes(key)||key.startsWith('filter.'))values[key]=value;
  }
  return href(theme,values);
}

export function buildReturnHref(theme,route={},category){
  return safeReturnHref(route.returnTo,theme)||href(theme,{view:'list',category:category||route.category||'zzz/agents'});
}

export function buildEntryHref(theme,item,sourceHash=globalThis.window?.location.hash){
  const source=parseArchiveHash(sourceHash);
  const returnTo=source?.params.has('entry')
    ?safeReturnHref(source.params.get('returnTo'),theme)
    :safeReturnHref(sourceHash,theme);
  return href(theme,{view:'list',category:item.category,entry:item.key,returnTo});
}

export function rememberSourcePosition(entryKey,sourceHash=globalThis.window?.location.hash){
  const source=parseArchiveHash(sourceHash);
  const returnTo=source&&safeReturnHref(sourceHash,source.theme);
  if(!returnTo||!globalThis.window)return;
  const position={x:window.scrollX,y:window.scrollY,entryKey};
  positions.delete(returnTo);
  positions.set(returnTo,position);
  if(positions.size>40)positions.delete(positions.keys().next().value);
  try{window.sessionStorage.setItem(positionKey,JSON.stringify([...positions]));}catch{/* Storage may be disabled. The current tab still remembers the position. */}
}

export function getSourcePosition(sourceHash){
  const source=parseArchiveHash(sourceHash);
  const returnTo=source&&safeReturnHref(sourceHash,source.theme);
  if(!returnTo)return null;
  if(!positions.has(returnTo)){
    try{
      const saved=JSON.parse(window.sessionStorage.getItem(positionKey)||'[]');
      if(Array.isArray(saved))for(const [key,value] of saved)positions.set(key,value);
    }catch{/* An unavailable or stale session must not prevent navigation. */}
  }
  const position=positions.get(returnTo);
  return position&&Number.isFinite(position.x)&&Number.isFinite(position.y)?position:null;
}

export function restoreSourcePosition(sourceHash){
  const position=getSourcePosition(sourceHash);
  if(!position)return false;
  const link=[...document.querySelectorAll('[data-entry-link]')].find(node=>node.dataset.entryLink===position.entryKey);
  link?.focus({preventScroll:true});
  window.scrollTo({left:position.x,top:position.y,behavior:'instant'});
  return true;
}
