import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import DemoApp from './DemoApp.jsx';

vi.mock('./CollectionLayouts.jsx',async()=>{
  const {EntryLink}=await import('./Visuals.jsx');
  return {default:({items,theme})=><div>{items.map(item=><EntryLink key={item.key} item={item} theme={theme}>{item.name}</EntryLink>)}</div>};
});
vi.mock('./DetailLayouts.jsx',async()=>{
  const {buildReturnHref}=await import('./navigation.js');
  return {default:({p,theme,route})=><article><h1>{p.name}</h1><a href={buildReturnHref(theme,route,p.category)}>返回检索</a></article>};
});
vi.mock('./DesignHome.jsx',()=>({default:()=> <h1>资料首页</h1>}));
vi.mock('./DesignGallery.jsx',()=>({default:()=> <h1>设计总览</h1>}));
vi.mock('./WorldLayouts.jsx',()=>({default:()=> <h1>游戏目录</h1>}));

const items=Array.from({length:18},(_,i)=>({key:`zzz/agents/${i+1}`,id:String(i+1),category:'zzz/agents',name:`条目 ${i+1}`,fields:{属性:'电',特性:'强攻',阵营:'测试'},detailFile:`/test-record/${i+1}`}));
const index={items,groups:[{id:'zzz/agents',total:18,count:18}]};
const listHash='#/ink?view=list&category=zzz%2Fagents&q=%E6%9D%A1%E7%9B%AE&filter.%E5%B1%9E%E6%80%A7=%E7%94%B5&page=2';

describe('demo navigation and disclosure interactions',()=>{
  beforeEach(()=>{
    window.history.replaceState(null,'','/demo.html#/ink');
    vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>url==='/demo-data/index.json'?index:{...items.find(item=>item.detailFile===url),sections:[]}})));
    vi.stubGlobal('scrollTo',vi.fn());
    vi.stubGlobal('requestAnimationFrame',callback=>{callback();return 1;});
    vi.stubGlobal('cancelAnimationFrame',vi.fn());
    Element.prototype.scrollIntoView=vi.fn();
  });
  afterEach(()=>{cleanup();vi.unstubAllGlobals();});

  it('closes the page picker with Escape and restores focus to its trigger',async()=>{
    render(<DemoApp/>);
    const trigger=await screen.findByRole('button',{name:/浏览页面/});
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('navigation',{name:'示例页面'}).contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('navigation',{name:'示例页面'})).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the picker when clicking outside, without stealing an outside control focus',async()=>{
    render(<DemoApp/>);
    fireEvent.click(await screen.findByRole('button',{name:/浏览页面/}));
    const search=screen.getByRole('textbox',{name:'全站搜索'});
    fireEvent.pointerDown(search);
    search.focus();
    expect(screen.queryByRole('navigation',{name:'示例页面'})).toBeNull();
    expect(document.activeElement).toBe(search);
  });

  it('announces the current primary navigation and ink brand',async()=>{
    render(<DemoApp/>);
    const nav=await screen.findByRole('navigation',{name:'主要导航'});
    expect(within(nav).getByRole('link',{name:'首页'}).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link',{name:'万象书局 首页'}).textContent).toContain('HENGBERGER ARCHIVE');
    expect(within(screen.getByRole('region',{name:'设计预览工具'})).getByRole('button',{name:/浏览页面/})).toBeTruthy();
  });

  it('keeps a focused filter available for repeated keyboard selection',async()=>{
    window.history.replaceState(null,'','/demo.html#/ink?view=list&category=zzz%2Fagents');
    render(<DemoApp/>);
    const filter=await screen.findByRole('combobox',{name:'属性',hidden:true});
    filter.closest('details').open=true;
    filter.focus();
    fireEvent.keyDown(filter,{key:'ArrowDown'});
    fireEvent.change(filter,{target:{value:'电'}});
    await waitFor(()=>expect(new URLSearchParams(window.location.hash.split('?')[1]).get('filter.属性')).toBe('电'));
    await waitFor(()=>expect(screen.getByText('清除条件 ×')).toBeTruthy());
    expect(document.activeElement).toBe(filter);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    fireEvent.keyDown(filter,{key:'ArrowUp'});
    fireEvent.change(filter,{target:{value:''}});
    await waitFor(()=>expect(new URLSearchParams(window.location.hash.split('?')[1]).has('filter.属性')).toBe(false));
    await waitFor(()=>expect(screen.queryByText('清除条件 ×')).toBeNull());
    expect(document.activeElement).toBe(filter);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('moves focus to results after submitting a query',async()=>{
    window.history.replaceState(null,'','/demo.html#/ink?view=list&category=zzz%2Fagents');
    render(<DemoApp/>);
    const search=await screen.findByRole('textbox',{name:'列表搜索'});
    search.focus();
    fireEvent.change(search,{target:{value:'条目 18'}});
    fireEvent.submit(search.closest('form'));
    await waitFor(()=>expect(document.activeElement?.className).toBe('result-line'));
    expect(document.activeElement.textContent).toContain('找到 1 条资料');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole('heading',{name:'查询结果',level:2})).toBeTruthy();
  });

  it('moves focus to the updated result summary after pagination',async()=>{
    window.history.replaceState(null,'',`/demo.html${listHash}`);
    render(<DemoApp/>);
    fireEvent.click(await screen.findByRole('button',{name:'下一页 →'}));
    await waitFor(()=>expect(window.location.hash).toContain('page=3'));
    await waitFor(()=>expect(document.activeElement?.className).toBe('result-line'));
    expect(document.activeElement.textContent).toContain('第 3 / 3 页');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it.each([
    ['2.5','条目 9','第 2 / 3 页'],
    ['-3','条目 1','第 1 / 3 页'],
    ['Infinity','条目 1','第 1 / 3 页'],
    ['200','条目 17','第 3 / 3 页'],
  ])('keeps URL page %s on a valid complete results page',async(page,firstItem,summary)=>{
    window.history.replaceState(null,'',`/demo.html${listHash.replace('page=2',`page=${page}`)}`);
    render(<DemoApp/>);
    expect(await screen.findByRole('link',{name:firstItem})).toBeTruthy();
    expect(screen.getByText(new RegExp(summary))).toBeTruthy();
    expect(screen.getByRole('spinbutton',{name:'跳转页码'}).value).toBe(summary.match(/第 (\d+)/)[1]);
  });

  it('closes the page picker when keyboard focus leaves its disclosure',async()=>{
    render(<DemoApp/>);
    fireEvent.click(await screen.findByRole('button',{name:/浏览页面/}));
    const search=screen.getByRole('textbox',{name:'全站搜索'});
    fireEvent.focusIn(search);
    expect(screen.queryByRole('navigation',{name:'示例页面'})).toBeNull();
  });

  it('returns from a detail with filters, search, page, scroll, and record focus intact',async()=>{
    window.history.replaceState(null,'',`/demo.html${listHash}`);
    Object.defineProperty(window,'scrollY',{configurable:true,value:620});
    Object.defineProperty(window,'scrollX',{configurable:true,value:0});
    render(<DemoApp/>);
    fireEvent.click(await screen.findByRole('link',{name:'条目 9'}));
    const back=await screen.findByRole('link',{name:'返回检索'});
    expect(back.getAttribute('href')).toBe(listHash);
    fireEvent.click(back);
    await screen.findByRole('link',{name:'条目 9'});
    await waitFor(()=>expect(window.location.hash).toBe(listHash));
    await waitFor(()=>expect(document.activeElement?.textContent).toBe('条目 9'));
    expect(window.scrollTo).toHaveBeenLastCalledWith({left:0,top:620,behavior:'instant'});
    expect(screen.getByRole('textbox',{name:'列表搜索'}).value).toBe('条目');
    expect(screen.getByRole('combobox',{name:'属性',hidden:true}).value).toBe('电');
  });
});
