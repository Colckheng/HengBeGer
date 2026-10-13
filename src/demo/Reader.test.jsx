import fs from 'node:fs';
import path from 'node:path';
import {afterEach,expect,test,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import ReaderSection,{RichText} from './Reader.jsx';

const initialFontDescriptor=Object.getOwnPropertyDescriptor(document,'fonts');
afterEach(()=>{
  cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();
  if(initialFontDescriptor)Object.defineProperty(document,'fonts',initialFontDescriptor);
  else delete document.fonts;
});
const cyrene=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),'src/demo/__fixtures__/entries/84ae09d72099f51c.json'),'utf8'));

test('the real skill table explains its columns and level input changes actual recorded values',()=>{
  render(<ReaderSection section={cyrene.sections.find(s=>s.title==='行迹')} theme="ink" route={{entry:cyrene.key}} index={0}/>);
  expect(screen.getByRole('columnheader',{name:'普攻·单体'})).toBeTruthy();
  expect(within(screen.getByRole('table')).getByText('25%')).toBeTruthy();
  fireEvent.change(screen.getByRole('slider',{name:'技能等级'}),{target:{value:'6'}});
  expect(within(screen.getByRole('table')).getByText('55%')).toBeTruthy();
  expect(within(screen.getByRole('table')).queryByText('25%')).toBe(null);
  fireEvent.click(screen.getByRole('button',{name:'盛放吧，来世的乐土（战技）'}));
  expect(screen.getByRole('columnheader',{name:'额外真实伤害'})).toBeTruthy();
  expect(within(screen.getByRole('table')).getByText('20%')).toBeTruthy();
});

test('the alternate raw skill source exposes a level control and readable ability tabs',()=>{
  render(<ReaderSection section={cyrene.sections.find(s=>s.title==='技能')} theme="ink" route={{entry:cyrene.key}} index={0}/>);
  expect(screen.getByRole('slider',{name:'技能等级'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'普攻 · 看，希望的起始！（单攻）'}).textContent).toBe('普攻');
  expect(screen.getByRole('columnheader',{name:'伤害倍率'})).toBeTruthy();
  fireEvent.change(screen.getByRole('slider',{name:'技能等级'}),{target:{value:'5'}});
  expect(within(screen.getByRole('table')).getByText('0.5')).toBeTruthy();
});

test('same-name stat nodes identify their actual source unlock conditions',()=>{
  render(<ReaderSection section={cyrene.sections.find(s=>s.title==='行迹')} theme="ink" route={{entry:cyrene.key}} index={0}/>);
  const unlockNode=screen.getByRole('button',{name:'暴击伤害强化（属性加成） · 角色等级80',hidden:true});
  fireEvent.click(unlockNode);
  expect(screen.getByText('暴击伤害提高10.7%')).toBeTruthy();
  expect(screen.getByRole('button',{name:'暴击伤害强化（属性加成） · 角色晋阶3',hidden:true})).toBeTruthy();
});

test('empty source headings do not create blank heading landmarks',()=>{
  render(<RichText body={'###\n\n已收录的说明。'} theme="ink" route={{}}/>);
  expect(screen.queryByRole('heading')).toBe(null);
  expect(screen.getByText('已收录的说明。')).toBeTruthy();
});

test('section notes render once beside the source content',()=>{
  render(<ReaderSection section={{id:'supplementary',title:'补充',body:'保留的正文。',notes:['另一份来源的参数。']}} theme="ink" route={{}} index={0}/>);
  expect(screen.getAllByText('另一份来源的参数。')).toHaveLength(1);
});

const simpleTable='| 项目 | 数值 |\n| --- | --- |\n| 攻击力 | 25 |';

test('table scrolling instructions and focus stop follow actual overflow and resize',()=>{
  let contentWidth=300,viewportWidth=400;
  vi.spyOn(Element.prototype,'scrollWidth','get').mockImplementation(()=>contentWidth);
  vi.spyOn(Element.prototype,'clientWidth','get').mockImplementation(()=>viewportWidth);
  const observers=[];
  vi.stubGlobal('ResizeObserver',class{
    constructor(callback){this.callback=callback;this.observe=vi.fn();this.disconnect=vi.fn();observers.push(this);}
  });
  const {unmount}=render(<RichText body={simpleTable} theme="ink" route={{}}/>);
  const viewport=screen.getByRole('table').parentElement;
  expect(screen.queryByText(/宽表可左右滑动/)).toBe(null);
  expect(viewport.hasAttribute('tabindex')).toBe(false);
  expect(viewport.hasAttribute('role')).toBe(false);
  expect(observers[0].observe).toHaveBeenCalledWith(viewport);
  expect(observers[0].observe).toHaveBeenCalledWith(screen.getByRole('table'));

  contentWidth=401;
  act(()=>observers[0].callback());
  expect(screen.queryByRole('region')).toBe(null);
  viewportWidth=250;
  act(()=>observers[0].callback());
  expect(screen.getByText(/宽表可左右滑动/)).toBeTruthy();
  expect(screen.getByRole('region',{name:'数据表，可横向滚动'}).tabIndex).toBe(0);

  viewportWidth=600;
  act(()=>observers[0].callback());
  expect(screen.queryByText(/宽表可左右滑动/)).toBe(null);
  expect(viewport.hasAttribute('tabindex')).toBe(false);
  unmount();
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
});

test('table measurements update for content, viewport and loaded fonts without ResizeObserver',async()=>{
  let contentWidth=200;
  vi.stubGlobal('ResizeObserver',undefined);
  vi.spyOn(Element.prototype,'scrollWidth','get').mockImplementation(()=>contentWidth);
  vi.spyOn(Element.prototype,'clientWidth','get').mockReturnValue(300);
  const fonts=new EventTarget();
  let fontsReady;
  fonts.ready=new Promise(resolve=>{fontsReady=resolve;});
  Object.defineProperty(document,'fonts',{configurable:true,value:fonts});
  const removeFontListener=vi.spyOn(fonts,'removeEventListener');
  const removeWindowListener=vi.spyOn(window,'removeEventListener');
  const {rerender,unmount}=render(<RichText body={simpleTable} theme="ink" route={{}}/>);
  expect(screen.queryByRole('region')).toBe(null);
  contentWidth=420;
  await act(async()=>{fontsReady();await fonts.ready;});
  expect(screen.getByRole('region')).toBeTruthy();
  contentWidth=220;
  act(()=>fonts.dispatchEvent(new Event('loadingdone')));
  expect(screen.queryByRole('region')).toBe(null);
  contentWidth=420;
  fireEvent.resize(window);
  expect(screen.getByRole('region')).toBeTruthy();
  contentWidth=220;
  rerender(<RichText body={simpleTable.replace('25','26')} theme="ink" route={{}}/>);
  expect(screen.queryByRole('region')).toBe(null);
  unmount();
  expect(removeFontListener).toHaveBeenCalledWith('loadingdone',expect.any(Function));
  expect(removeWindowListener).toHaveBeenCalledWith('resize',expect.any(Function));
});
