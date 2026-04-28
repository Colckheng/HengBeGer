import {
  parseNonNegativeIntQuery,
  parseNumberListQuery,
  parsePositiveIntQuery,
  parseStringListQuery,
} from '../utils/publicListQuery.js';

describe('public list query helpers', () => {
  it('parses positive integer pagination values', () => {
    expect(parsePositiveIntQuery('12')).toBe(12);
    expect(parsePositiveIntQuery('0')).toBeUndefined();
    expect(parsePositiveIntQuery('-5')).toBeUndefined();
    expect(parsePositiveIntQuery('abc')).toBeUndefined();
  });

  it('parses non-negative offset values with fallback', () => {
    expect(parseNonNegativeIntQuery('24')).toBe(24);
    expect(parseNonNegativeIntQuery('-1', 7)).toBe(7);
    expect(parseNonNegativeIntQuery('oops', 5)).toBe(5);
  });

  it('parses string and numeric multi-value filters', () => {
    expect(parseStringListQuery('电, 火 , 电')).toEqual(['电', '火']);
    expect(parseStringListQuery(['S', 'A', 'S'])).toEqual(['S', 'A']);
    expect(parseNumberListQuery('1,2,2,0,-1,foo')).toEqual([1, 2]);
  });
});
