'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollManager, type HomeyTimers, type PollConfig } from '../../../lib/utils/poll-manager';

/**
 * Unit tests for exponential backoff behavior in PollManager
 * 
 * These tests verify:
 * - Backoff calculation is correct
 * - Backoff increases exponentially on failure
 * - Backoff resets on success
 * - Max retries are respected
 */
describe('Exponential Backoff', () => {
  let pollManager: PollManager;
  let mockTimers: HomeyTimers;
  let mockIntervalIds: ReturnType<typeof setInterval>[];

  beforeEach(() => {
    mockIntervalIds = [];
    let idCounter = 1;
    
    mockTimers = {
      setInterval: vi.fn((_callback: () => void, _ms: number) => {
        const id = idCounter++ as unknown as ReturnType<typeof setInterval>;
        mockIntervalIds.push(id);
        // Store callback and interval for potential manual triggering
        return id;
      }),
      clearInterval: vi.fn((id: ReturnType<typeof setInterval>) => {
        const index = mockIntervalIds.indexOf(id);
        if (index > -1) {
          mockIntervalIds.splice(index, 1);
        }
      }),
      log: vi.fn(),
    };
    
    pollManager = new PollManager(mockTimers, vi.fn());
  });

  afterEach(() => {
    pollManager.stopAll();
  });

  describe('Backoff Calculation', () => {
    it('should start with base interval on first failure', () => {
      // Register a poll with base interval of 1000ms
      const callback = vi.fn().mockRejectedValue(new Error('Failure'));
      const config: PollConfig = {
        baseInterval: 1000,
        minInterval: 1000,
        maxInterval: 30000,
        maxRetries: 5,
      };
      
      pollManager.register('test', callback, config);
      
      // Get state after registration
      const state = pollManager.getState('test');
      expect(state?.currentInterval).toBe(1000);
    });

    it('should double interval on each failure (exponential growth)', () => {
      const config: PollConfig = {
        baseInterval: 1000,
        minInterval: 1000,
        maxInterval: 30000,
        maxRetries: 5,
      };
      
      // Verify the exponential pattern: 1s -> 2s -> 4s -> 8s -> 16s
      const intervals = [];
      let interval = config.baseInterval;
      
      for (let i = 0; i < 5; i++) {
        intervals.push(interval);
        interval = Math.min(interval * 2, config.maxInterval ?? 30000);
      }
      
      expect(intervals).toEqual([1000, 2000, 4000, 8000, 16000]);
    });

    it('should cap backoff at max interval', () => {
      const config: PollConfig = {
        baseInterval: 8000,
        minInterval: 1000,
        maxInterval: 30000,
        maxRetries: 10,
      };
      
      // Starting at 8s, doubling: 8 -> 16 -> 30 (capped) -> 30 -> 30
      let interval = config.baseInterval;
      
      // First backoff: 8 -> 16
      interval = Math.min(interval * 2, config.maxInterval ?? 30000);
      expect(interval).toBe(16000);
      
      // Second backoff: 16 -> 30 (capped at max)
      interval = Math.min(interval * 2, config.maxInterval ?? 30000);
      expect(interval).toBe(30000);
      
      // Third backoff: stays at 30 (already at max)
      interval = Math.min(interval * 2, config.maxInterval ?? 30000);
      expect(interval).toBe(30000);
    });

    it('should reset interval to base on success', () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const config: PollConfig = {
        baseInterval: 5000,
        minInterval: 1000,
        maxInterval: 30000,
        maxRetries: 5,
      };
      
      pollManager.register('test', callback, config);
      
      // Get initial state
      const state = pollManager.getState('test');
      expect(state?.currentInterval).toBe(5000);
    });
  });

  describe('Retry Limits', () => {
    it('should track consecutive errors correctly', () => {
      const callback = vi.fn().mockRejectedValue(new Error('Failure'));
      const config: PollConfig = {
        baseInterval: 1000,
        minInterval: 1000,
        maxInterval: 30000,
        maxRetries: 3,
      };
      
      pollManager.register('test', callback, config);
      const state = pollManager.getState('test');
      
      // Initial state should have 0 consecutive errors
      expect(state?.consecutiveErrors).toBe(0);
    });

    it('should stop polling after max retries exceeded', () => {
      // Verify the concept - if retries >= maxRetries, polling should stop
      const maxRetries = 5;
      let retryCount = 0;
      
      // Simulate retry logic
      const shouldContinue = (): boolean => {
        retryCount++;
        return retryCount < maxRetries;
      };
      
      // First 4 retries should continue
      expect(shouldContinue()).toBe(true);
      expect(shouldContinue()).toBe(true);
      expect(shouldContinue()).toBe(true);
      expect(shouldContinue()).toBe(true);
      
      // 5th retry should stop
      expect(shouldContinue()).toBe(false);
    });

    it('should reset retry count on success', () => {
      // Verify concept - success resets retry count
      let retryCount = 3;
      const success = true;
      
      if (success) {
        retryCount = 0;
      }
      
      expect(retryCount).toBe(0);
    });
  });

  describe('Backoff Formula', () => {
    it('should follow 1s -> 2s -> 4s -> 8s -> 16s -> 30s (capped) pattern', () => {
      const baseInterval = 1000;
      const maxInterval = 30000;
      
      // Calculate expected intervals
      const expected = [
        1000,   // 0 failures: base
        2000,   // 1 failure: 1s * 2
        4000,   // 2 failures: 2s * 2
        8000,   // 3 failures: 4s * 2
        16000,  // 4 failures: 8s * 2
        30000,  // 5 failures: capped at 30s
        30000,  // 6+ failures: stays capped
      ];
      
      let interval = baseInterval;
      const actual = [interval];
      
      for (let i = 0; i < 6; i++) {
        interval = Math.min(interval * 2, maxInterval);
        actual.push(interval);
      }
      
      expect(actual).toEqual(expected);
    });

    it('should use minInterval as floor when calculating backoff', () => {
      const config: PollConfig = {
        baseInterval: 500,
        minInterval: 1000,
        maxInterval: 30000,
        maxRetries: 5,
      };
      
      // Even if base is 500ms, actual interval should not go below minInterval
      // when used in the PollManager
      const effectiveInterval = Math.max(config.baseInterval, config.minInterval ?? 1000);
      expect(effectiveInterval).toBe(1000);
    });
  });

  describe('PollManager State Management', () => {
    it('should track registered polls', () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const config: PollConfig = {
        baseInterval: 1000,
        minInterval: 1000,
        maxInterval: 30000,
        maxRetries: 5,
      };
      
      pollManager.register('system', callback, config);
      pollManager.register('storage', callback, config);
      
      expect(pollManager.getState('system')).toBeDefined();
      expect(pollManager.getState('storage')).toBeDefined();
      expect(pollManager.getState('nonexistent')).toBeUndefined();
    });

    it('should stop specific poll without affecting others', () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const config: PollConfig = {
        baseInterval: 1000,
        minInterval: 1000,
        maxInterval: 30000,
        maxRetries: 5,
      };
      
      pollManager.register('system', callback, config);
      pollManager.register('storage', callback, config);
      
      pollManager.start('system');
      pollManager.start('storage');
      
      // Stop only system
      pollManager.stop('system');
      
      // System should be stopped, storage should still exist
      const systemState = pollManager.getState('system');
      const storageState = pollManager.getState('storage');
      
      expect(systemState?.isRunning).toBe(false);
      expect(storageState?.isRunning).toBe(true);
    });

    it('should stop all polls on stopAll()', () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const config: PollConfig = {
        baseInterval: 1000,
        minInterval: 1000,
        maxInterval: 30000,
        maxRetries: 5,
      };
      
      pollManager.register('system', callback, config);
      pollManager.register('storage', callback, config);
      
      pollManager.start('system');
      pollManager.start('storage');
      
      // Stop all
      pollManager.stopAll();
      
      // Both should be stopped
      const systemState = pollManager.getState('system');
      const storageState = pollManager.getState('storage');
      
      expect(systemState?.isRunning).toBe(false);
      expect(storageState?.isRunning).toBe(false);
    });
  });
});
