'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollManager, type HomeyTimers, POLL_INTERVALS } from '../../../lib/utils/poll-manager';

// Mock HomeyTimers implementation
function createMockTimers(): HomeyTimers & {
  intervalCallbacks: Map<ReturnType<typeof setInterval>, { callback: () => void; interval: number }>;
  triggerInterval: (id: ReturnType<typeof setInterval>) => void;
  getIntervalIds: () => ReturnType<typeof setInterval>[];
  getLatestInterval: () => { id: ReturnType<typeof setInterval>; interval: number } | undefined;
} {
  let intervalId = 0;
  const intervalCallbacks = new Map<ReturnType<typeof setInterval>, { callback: () => void; interval: number }>();

  return {
    intervalCallbacks,
    setInterval: vi.fn((callback: () => void, interval: number) => {
      const id = { __intervalId: ++intervalId } as unknown as ReturnType<typeof setInterval>;
      intervalCallbacks.set(id, { callback, interval });
      return id;
    }),
    clearInterval: vi.fn((id: ReturnType<typeof setInterval>) => {
      intervalCallbacks.delete(id);
    }),
    log: vi.fn(),
    triggerInterval: (id: ReturnType<typeof setInterval>) => {
      const entry = intervalCallbacks.get(id);
      if (entry) {
        entry.callback();
      }
    },
    getIntervalIds: () => Array.from(intervalCallbacks.keys()),
    getLatestInterval: () => {
      const ids = Array.from(intervalCallbacks.keys());
      if (ids.length === 0) return undefined;
      const lastId = ids[ids.length - 1];
      const entry = intervalCallbacks.get(lastId);
      return entry ? { id: lastId, interval: entry.interval } : undefined;
    },
  };
}

describe('PollManager', () => {
  let mockTimers: ReturnType<typeof createMockTimers>;
  let pollManager: PollManager;

  beforeEach(() => {
    mockTimers = createMockTimers();
    pollManager = new PollManager(mockTimers);
  });

  afterEach(() => {
    pollManager.stopAll();
  });

  describe('register()', () => {
    it('should register a poll with given config', () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });

      const state = pollManager.getState('test-poll');
      expect(state).toBeDefined();
      expect(state?.isRunning).toBe(false);
    });

    it('should not start the poll automatically', () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });

      expect(mockTimers.setInterval).not.toHaveBeenCalled();
    });

    it('should stop existing poll when re-registering', () => {
      const callback1 = vi.fn().mockResolvedValue(undefined);
      const callback2 = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback1, { baseInterval: 5000 });
      pollManager.start('test-poll');

      // Re-register should stop existing
      pollManager.register('test-poll', callback2, { baseInterval: 10000 });

      expect(mockTimers.clearInterval).toHaveBeenCalled();
      const state = pollManager.getState('test-poll');
      expect(state?.isRunning).toBe(false);
    });

    it('should apply default config values', () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });
      pollManager.start('test-poll');

      // The internal config should have defaults applied
      const state = pollManager.getState('test-poll');
      expect(state?.currentInterval).toBe(5000);
    });
  });

  describe('start()', () => {
    it('should start polling with configured interval', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });
      pollManager.start('test-poll');

      // Give the immediate execution a chance to run
      await Promise.resolve();
      await Promise.resolve();

      const state = pollManager.getState('test-poll');
      expect(state?.isRunning).toBe(true);
      expect(mockTimers.setInterval).toHaveBeenCalled();
    });

    it('should execute callback immediately on start', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });
      pollManager.start('test-poll');

      // Give the immediate execution a chance to run
      await Promise.resolve();
      await Promise.resolve();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not start if already running', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });
      pollManager.start('test-poll');
      await Promise.resolve();

      pollManager.start('test-poll'); // Should be no-op

      // Only one setInterval call (may have been called multiple times for scheduling)
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should do nothing for unregistered poll', () => {
      pollManager.start('nonexistent');

      expect(mockTimers.setInterval).not.toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should stop a running poll', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });
      pollManager.start('test-poll');
      await Promise.resolve();

      pollManager.stop('test-poll');

      const state = pollManager.getState('test-poll');
      expect(state?.isRunning).toBe(false);
      expect(mockTimers.clearInterval).toHaveBeenCalled();
    });

    it('should do nothing for non-running poll', () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });
      pollManager.stop('test-poll');

      // No error, no clearInterval called before start
      expect(mockTimers.clearInterval).not.toHaveBeenCalled();
    });

    it('should do nothing for unregistered poll', () => {
      pollManager.stop('nonexistent');

      expect(mockTimers.clearInterval).not.toHaveBeenCalled();
    });
  });

  describe('stopAll()', () => {
    it('should stop all running polls', async () => {
      const callback1 = vi.fn().mockResolvedValue(undefined);
      const callback2 = vi.fn().mockResolvedValue(undefined);

      pollManager.register('poll1', callback1, { baseInterval: 5000 });
      pollManager.register('poll2', callback2, { baseInterval: 10000 });
      pollManager.start('poll1');
      pollManager.start('poll2');
      await Promise.resolve();

      pollManager.stopAll();

      expect(pollManager.getState('poll1')?.isRunning).toBe(false);
      expect(pollManager.getState('poll2')?.isRunning).toBe(false);
    });
  });

  describe('unregister()', () => {
    it('should stop and remove a poll', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });
      pollManager.start('test-poll');
      await Promise.resolve();

      pollManager.unregister('test-poll');

      expect(pollManager.getState('test-poll')).toBeUndefined();
    });

    it('should do nothing for unregistered poll', () => {
      expect(() => pollManager.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('forceRun()', () => {
    it('should execute callback immediately', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });

      await pollManager.forceRun('test-poll');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should work even when poll is not running', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });

      await pollManager.forceRun('test-poll');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle unregistered poll gracefully', async () => {
      await expect(pollManager.forceRun('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('getState()', () => {
    it('should return poll state', () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });

      const state = pollManager.getState('test-poll');
      expect(state).toEqual({
        interval: null,
        currentInterval: 5000,
        consecutiveErrors: 0,
        isRunning: false,
        lastSuccess: null,
        lastError: null,
      });
    });

    it('should return undefined for unregistered poll', () => {
      expect(pollManager.getState('nonexistent')).toBeUndefined();
    });

    it('should track lastSuccess after successful callback', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      pollManager.register('test-poll', callback, { baseInterval: 5000 });
      await pollManager.forceRun('test-poll');

      const state = pollManager.getState('test-poll');
      expect(state?.lastSuccess).toBeInstanceOf(Date);
    });

    it('should track lastError after failed callback', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Test error'));

      pollManager.register('test-poll', callback, { baseInterval: 5000 });
      await pollManager.forceRun('test-poll');

      const state = pollManager.getState('test-poll');
      expect(state?.lastError).toBeInstanceOf(Date);
    });
  });

  describe('exponential backoff', () => {
    it('should increase interval after error', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Test error'));

      pollManager.register('test-poll', callback, {
        baseInterval: 1000,
        maxInterval: 30000,
        backoffMultiplier: 2,
      });
      pollManager.start('test-poll');

      // Wait for initial callback to fail
      await Promise.resolve();
      await Promise.resolve();

      const state = pollManager.getState('test-poll');
      // After 1 error: 1000 * 2^1 = 2000
      expect(state?.currentInterval).toBe(2000);
      expect(state?.consecutiveErrors).toBe(1);
    });

    it('should cap interval at maxInterval', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Test error'));

      pollManager.register('test-poll', callback, {
        baseInterval: 1000,
        maxInterval: 5000,
        backoffMultiplier: 2,
        maxRetries: 10,
      });
      pollManager.start('test-poll');

      // Simulate multiple failures by triggering intervals
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
        await Promise.resolve();
        const intervals = mockTimers.getIntervalIds();
        if (intervals.length > 0) {
          mockTimers.triggerInterval(intervals[intervals.length - 1]);
        }
      }

      const state = pollManager.getState('test-poll');
      expect(state?.currentInterval).toBeLessThanOrEqual(5000);
    });

    it('should reset interval after successful callback', async () => {
      let callCount = 0;
      const callback = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Test error'));
        }
        return Promise.resolve();
      });

      pollManager.register('test-poll', callback, {
        baseInterval: 1000,
        maxInterval: 30000,
        maxRetries: 10,
      });

      // First two calls fail
      await pollManager.forceRun('test-poll');
      await pollManager.forceRun('test-poll');

      // Third call succeeds
      await pollManager.forceRun('test-poll');

      const state = pollManager.getState('test-poll');
      expect(state?.currentInterval).toBe(1000); // Reset to base
      expect(state?.consecutiveErrors).toBe(0);
    });
  });

  describe('max retries', () => {
    it('should stop poll after max retries exceeded', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Test error'));

      pollManager.register('test-poll', callback, {
        baseInterval: 1000,
        maxRetries: 3,
      });
      pollManager.start('test-poll');

      // Initial call fails
      await Promise.resolve();
      await Promise.resolve();

      // Trigger more failures
      for (let i = 0; i < 3; i++) {
        const intervals = mockTimers.getIntervalIds();
        if (intervals.length > 0) {
          mockTimers.triggerInterval(intervals[intervals.length - 1]);
          await Promise.resolve();
          await Promise.resolve();
        }
      }

      const state = pollManager.getState('test-poll');
      expect(state?.isRunning).toBe(false);
    });

    it('should use default maxRetries of 5', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Test error'));

      pollManager.register('test-poll', callback, { baseInterval: 1000 });
      pollManager.start('test-poll');

      // Simulate 5 failures
      for (let i = 0; i < 6; i++) {
        await Promise.resolve();
        await Promise.resolve();
        const intervals = mockTimers.getIntervalIds();
        if (intervals.length > 0) {
          mockTimers.triggerInterval(intervals[intervals.length - 1]);
        }
      }

      const state = pollManager.getState('test-poll');
      expect(state?.isRunning).toBe(false);
    });
  });

  describe('POLL_INTERVALS constants', () => {
    it('should have expected default intervals', () => {
      expect(POLL_INTERVALS.SYSTEM_METRICS).toBe(30000);
      expect(POLL_INTERVALS.STORAGE).toBe(300000);
      expect(POLL_INTERVALS.DOCKER).toBe(60000);
      expect(POLL_INTERVALS.VMS).toBe(60000);
    });
  });
});
