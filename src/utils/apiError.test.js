import { describe, expect, it } from 'vitest';

import { getApiErrorMessage } from './apiError.js';

describe('getApiErrorMessage', () => {
  it('prefers response.data.message', () => {
    const error = {
      message: 'outer error',
      response: {
        data: {
          message: 'payload message',
          error: 'payload error',
        },
      },
    };

    expect(getApiErrorMessage(error, 'fallback')).toBe('payload message');
  });

  it('falls back to response.data.error', () => {
    const error = {
      message: 'outer error',
      response: {
        data: {
          error: 'payload error',
        },
      },
    };

    expect(getApiErrorMessage(error, 'fallback')).toBe('payload error');
  });

  it('falls back to error.message and then fallback', () => {
    expect(getApiErrorMessage({ message: 'outer error' }, 'fallback')).toBe('outer error');
    expect(getApiErrorMessage({}, 'fallback')).toBe('fallback');
  });
});
