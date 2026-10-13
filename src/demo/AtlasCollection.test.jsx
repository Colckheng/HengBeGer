import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import AtlasCollection from './AtlasCollection.jsx';

const characters = [
  {key:'hsr/characters/1224', id:'1224', name:'三月七', category:'hsr/characters', fields:{命途:'巡猎', 属性:'虚数'}},
  {key:'hsr/characters/1001', id:'1001', name:'三月七', category:'hsr/characters', fields:{命途:'存护', 属性:'冰'}},
];

describe('Open Index collection', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.location.hash = '#/orbital?view=list&category=hsr%2Fcharacters&q=三月七';
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('distinguishes same-name character forms and uses one primary link per record', () => {
    render(<AtlasCollection items={characters}/>);
    expect(screen.getByRole('heading', {name:/三月七\s*\/ 巡猎/})).toBeTruthy();
    expect(screen.getByRole('heading', {name:/三月七\s*\/ 存护/})).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(new URLSearchParams(links[0].getAttribute('href').split('?')[1]).get('returnTo')).toBe(window.location.hash);
  });

  it('persists the selected view when the collection is unmounted for a detail', () => {
    const first = render(<AtlasCollection items={characters}/>);
    expect(screen.getByRole('button', {name:'图版'}).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', {name:'列表'}));
    expect(screen.getByRole('button', {name:'列表'}).getAttribute('aria-pressed')).toBe('true');
    first.unmount();
    render(<AtlasCollection items={characters}/>);
    expect(screen.getByRole('button', {name:'列表'}).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the display switch usable if session storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    render(<AtlasCollection items={characters}/>);
    fireEvent.click(screen.getByRole('button', {name:'列表'}));
    expect(screen.getByRole('button', {name:'列表'}).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps missing images and absent dates explicit, without inventing values', () => {
    render(<AtlasCollection items={[
      {key:'currency/season1/traits/1001', id:'1001', name:'坚韧', category:'currency/season1/traits', fields:{}},
      {key:'hsr/gacha/1', id:'1', name:'某次活动', category:'hsr/gacha', fields:{}},
    ]}/>);
    expect(screen.getByText('暂无插图')).toBeTruthy();
    expect(screen.getByText('开始时间未提供 — 结束时间未提供')).toBeTruthy();
    expect(screen.queryByText('01/01')).toBeNull();
  });

  it('shows event dates exactly from the record and identifies currency star tier', () => {
    render(<AtlasCollection items={[
      {key:'hsr/gacha/125', id:'125', name:'活动', category:'hsr/gacha', fields:{start_time:'2026-01-13 00:00:00', end_open:true}},
      {key:'currency/season1/roles/1001', id:'1001', name:'三月七', category:'currency/season1/roles', fields:{星阶:3}},
    ]}/>);
    expect(screen.getByText('2026-01-13 — 长期')).toBeTruthy();
    expect(screen.getByRole('heading', {name:/三月七\s*\/ 3 阶/})).toBeTruthy();
  });
});
