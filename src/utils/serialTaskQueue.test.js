import { describe, expect, it } from 'vitest';

import { createSerialTaskQueue } from './serialTaskQueue.js';

describe('createSerialTaskQueue', () => {
  it('runs tasks one after another', async () => {
    const queue = createSerialTaskQueue();
    const events = [];

    const firstTask = queue(async () => {
      events.push('first:start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push('first:end');
      return 'first';
    });

    const secondTask = queue(async () => {
      events.push('second:start');
      events.push('second:end');
      return 'second';
    });

    await expect(firstTask).resolves.toBe('first');
    await expect(secondTask).resolves.toBe('second');
    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
  });

  it('continues after a failed task', async () => {
    const queue = createSerialTaskQueue();
    const events = [];

    const failedTask = queue(async () => {
      events.push('failed:start');
      throw new Error('boom');
    });

    const nextTask = queue(async () => {
      events.push('next:start');
      events.push('next:end');
      return 'ok';
    });

    await expect(failedTask).rejects.toThrow('boom');
    await expect(nextTask).resolves.toBe('ok');
    expect(events).toEqual([
      'failed:start',
      'next:start',
      'next:end',
    ]);
  });
});
