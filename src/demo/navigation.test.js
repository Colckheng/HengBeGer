import {beforeEach,describe,expect,it,vi} from 'vitest';
import {buildEntryHref,buildReturnHref,safeReturnHref,rememberSourcePosition,getSourcePosition,restoreSourcePosition} from './navigation.js';

const item={key:'hsr/characters/1415',category:'hsr/characters'};
const source='#/ink?view=list&category=zzz%2Fagents&scope=all&q=%E6%9D%A1%E7%9B%AE&filter.%E5%B1%9E%E6%80%A7=%E7%94%B5&page=2';
const routeOf=value=>Object.fromEntries(new URLSearchParams(value.split('?')[1]));

describe('archive return navigation',()=>{
  beforeEach(()=>{
    window.sessionStorage.clear();
    document.body.replaceChildren();
    vi.stubGlobal('scrollTo',vi.fn());
  });

  it('keeps the complete source search when entering a result in another category',()=>{
    const route=routeOf(buildEntryHref('ink',item,source));
    expect(route.entry).toBe(item.key);
    expect(route.category).toBe(item.category);
    expect(buildReturnHref('ink',route,item.category)).toBe(source);
  });

  it('keeps the original source through related-record navigation without nesting details',()=>{
    const first=buildEntryHref('ink',item,source);
    const second=buildEntryHref('ink',{key:'hsr/characters/1001',category:'hsr/characters'},first);
    expect(routeOf(second).returnTo).toBe(source);
    expect(buildReturnHref('ink',routeOf(second),item.category)).toBe(source);
  });

  it('preserves explicit sort direction in a source route',()=>{
    const sortedSource=`${source}&sort=name&order=asc`;
    const route=routeOf(buildEntryHref('ink',item,sortedSource));
    expect(buildReturnHref('ink',route,item.category)).toBe(sortedSource);
  });

  it.each(['https://example.com','#//example.com','#/unknown?view=list','javascript:alert(1)','#/ink?view=list&entry=hsr%2Fcharacters%2F1415','#/ink?view=redirect','#/ink#https://example.com','#/ink\n?view=list'])('rejects unsafe or non-source return routes: %s',returnTo=>{
    expect(safeReturnHref(returnTo,'ink')).toBeNull();
    expect(buildReturnHref('ink',{returnTo},item.category)).toBe('#/ink?view=list&category=hsr%2Fcharacters');
  });

  it('switches a valid source to the current theme and drops nested return parameters',()=>{
    expect(safeReturnHref('#/orbital?view=list&category=hsr%2Fcharacters&returnTo=https%3A%2F%2Fevil.example','ink')).toBe('#/ink?view=list&category=hsr%2Fcharacters');
  });

  it('restores source scroll and the exact record that opened the detail',()=>{
    Object.defineProperty(window,'scrollX',{configurable:true,value:0});
    Object.defineProperty(window,'scrollY',{configurable:true,value:640});
    rememberSourcePosition(item.key,source);
    const link=document.createElement('a');
    link.href='#/ink';
    link.dataset.entryLink=item.key;
    document.body.append(link);
    expect(restoreSourcePosition(source)).toBe(true);
    expect(document.activeElement).toBe(link);
    expect(window.scrollTo).toHaveBeenCalledWith({left:0,top:640,behavior:'instant'});
  });

  it('does not overwrite source scroll while traversing related details',()=>{
    const detail=buildEntryHref('ink',item,source);
    rememberSourcePosition(item.key,source);
    const before=getSourcePosition(source);
    Object.defineProperty(window,'scrollY',{configurable:true,value:900});
    rememberSourcePosition('hsr/characters/1001',detail);
    expect(getSourcePosition(source)).toEqual(before);
  });
});
