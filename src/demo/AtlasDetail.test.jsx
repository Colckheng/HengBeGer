import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import AtlasDetail from './AtlasDetail.jsx';

const data = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/demo/__fixtures__/index.json'), 'utf8'));
const record = key => {
  const item = data.items.find(item => item.key === key);
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/demo/__fixtures__', item.detailFile.replace('/demo-data/', '')), 'utf8'));
};
const cyrene = record('hsr/characters/1415');
let callbacks;
beforeEach(() => {
  callbacks = [];
  vi.stubGlobal('requestAnimationFrame', callback => { callbacks.push(callback); return callbacks.length; });
  vi.stubGlobal('matchMedia', () => ({matches: true}));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const flushFrames = () => act(() => { callbacks.splice(0).forEach(callback => callback()); });

test('changing groups keeps keyboard focus; choosing a chapter focuses its updated reading region', () => {
  render(<AtlasDetail p={cyrene} route={{entry: cyrene.key}} data={data}/>);
  const group = within(screen.getByRole('navigation', {name: '档案内容分类'})).getByRole('button', {name: /^故事/});
  group.focus();
  fireEvent.click(group);
  expect(document.activeElement).toBe(group);
  expect(group.getAttribute('aria-pressed')).toBe('true');
  const chapter = screen.getByRole('navigation', {name: '故事章节'}).querySelector('button');
  fireEvent.click(chapter);
  flushFrames();
  expect(document.activeElement).toBe(screen.getByRole('region', {name: /正文$/}));
  expect(chapter.getAttribute('aria-current')).toBe('location');
});

test('the mobile chapter toggle controls the real unique directory and closes after chapter selection', () => {
  render(<AtlasDetail p={cyrene} route={{entry: cyrene.key}} data={data}/>);
  const toggle = screen.getByRole('button', {name: /目录 ＋/});
  expect(document.getElementById(toggle.getAttribute('aria-controls'))).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('navigation', {name: '战斗章节'}).querySelector('button'));
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
});

test('a confirmed light cone keeps its summary and body table on one Lv.80 value set', () => {
  const cone = record('hsr/light_cones/20000');
  render(<AtlasDetail p={cone} route={{entry: cone.key}} data={data}/>);
  expect(document.querySelector('.atlasx-stats').textContent).toContain('基础属性 · Lv.80');
  const stats = document.querySelector('.atlasx-stats');
  expect(stats.textContent).toContain('846');
  expect(stats.textContent).toContain('317');
  expect(stats.textContent).toContain('264');
  const source = screen.getByText('来源与核验记录', {selector: 'summary > span'}).closest('details');
  expect(source.open).toBe(false);
  expect(source.textContent).not.toContain('847 / 318 / 265');
  // The detail reader exposes the same Lv.80 table as the profile summary.
  const body = document.body.textContent;
  for (const value of ['846', '317', '264']) expect(body).toContain(value);
});

test('every confirmed light cone labels its Lv.80 summary', () => {
  for (const key of data.items.filter(item => item.category === 'hsr/light_cones').map(item => item.key)) {
    const cone = record(key);
    const view = render(<AtlasDetail p={cone} route={{entry: cone.key}} data={data}/>);
    expect(document.querySelector('.atlasx-stats').textContent).toContain('基础属性 · Lv.80');
    view.unmount();
  }
});

test('the officially unconfirmed light cone keeps its retained values and says so', () => {
  const cone = record('hsr/light_cones/21003');
  render(<AtlasDetail p={cone} route={{entry: cone.key}} data={data}/>);
  expect(document.querySelector('.atlasx-stats').textContent).toContain('生命值');
  const body = document.querySelector('.atlasx-section') || document.body;
  expect(body.textContent).toContain('953');
  expect(body.textContent).toContain('476');
  expect(body.textContent).toContain('331');
});

test('record navigation resets chapter state while preserving the complete return destination', () => {
  const returnTo = '#/orbital?view=list&category=hsr%2Fcharacters&scope=all&q=%E4%B8%89%E6%9C%88&page=2';
  const {rerender} = render(<AtlasDetail p={cyrene} route={{entry: cyrene.key, returnTo}} data={data}/>);
  fireEvent.click(within(screen.getByRole('navigation', {name: '档案内容分类'})).getByRole('button', {name: /^故事/}));
  const cone = record('hsr/light_cones/21003');
  rerender(<AtlasDetail p={cone} route={{entry: cone.key, returnTo}} data={data}/>);
  expect(screen.getByRole('heading', {level: 1}).textContent).toContain(cone.name);
  expect(screen.getByRole('region', {name: /正文$/}).getAttribute('aria-label')).not.toContain('故事');
  expect(document.querySelector('.atlasx-breadcrumb a').getAttribute('href')).toBe(returnTo);
});

test('image failure leaves a named, deliberate fallback instead of a broken image', () => {
  render(<AtlasDetail p={cyrene} route={{entry: cyrene.key}} data={data}/>);
  fireEvent.error(document.querySelector('.atlasx-profile-art img'));
  expect(document.querySelector('.atlasx-profile-art img')).toBeNull();
  expect(document.querySelector('.atlasx-profile-art .is-symbol').textContent).toContain('昔');
});
