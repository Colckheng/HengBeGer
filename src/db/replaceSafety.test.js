import { describe, expect, it } from 'vitest';

import { AppError } from '../utils/errorHandler.js';
import { assertReplaceSafety } from './replaceSafety.js';

describe('assertReplaceSafety', () => {
  it('rejects an empty incoming list when records exist', () => {
    expect(() => assertReplaceSafety('agents', 0, 43)).toThrow(AppError);
    expect(() => assertReplaceSafety('agents', 0, 43)).toThrow(/delete all 43 existing "agents"/);
    expect(() => assertReplaceSafety('agents', 0, 43)).toThrow(
      expect.objectContaining({ statusCode: 409 }),
    );
  });

  it('allows an empty incoming list when the wipe is confirmed', () => {
    expect(() => assertReplaceSafety('agents', 0, 43, { allowEmptyWipe: true })).not.toThrow();
  });

  it('allows an empty incoming list when nothing exists to delete', () => {
    expect(() => assertReplaceSafety('hsrRelics', 0, 0)).not.toThrow();
  });

  it('allows non-empty incoming lists regardless of existing count', () => {
    expect(() => assertReplaceSafety('agents', 1, 43)).not.toThrow();
    expect(() => assertReplaceSafety('agents', 1, 0)).not.toThrow();
  });
});
