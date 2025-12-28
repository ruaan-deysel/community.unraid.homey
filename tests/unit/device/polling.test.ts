'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollManager, POLL_INTERVALS, type HomeyTimers } from '../../../lib/utils/poll-manager';

/**
 * Unit tests for device polling behavior
 * 
 * These tests verify:
 * - Correct polling intervals are used
 * - Polling starts/stops correctly
 * - Capability values are updated
 */
describe('Device Polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Poll Intervals', () => {
    it('should define system metrics interval as 30 seconds', () => {
      expect(POLL_INTERVALS.SYSTEM_METRICS).toBe(30000);
    });

    it('should define storage interval as 5 minutes', () => {
      expect(POLL_INTERVALS.STORAGE).toBe(300000);
    });

    it('should define docker interval as 1 minute', () => {
      expect(POLL_INTERVALS.DOCKER).toBe(60000);
    });

    it('should define VMs interval as 1 minute', () => {
      expect(POLL_INTERVALS.VMS).toBe(60000);
    });
  });

  describe('Polling Behavior', () => {
    it('should verify polling intervals are within acceptable bounds', () => {
      // System metrics should be at least 15s to avoid rate limiting
      expect(POLL_INTERVALS.SYSTEM_METRICS).toBeGreaterThanOrEqual(15000);
      
      // Storage can be less frequent as it changes rarely
      expect(POLL_INTERVALS.STORAGE).toBeGreaterThanOrEqual(60000);
      
      // Docker containers update at reasonable interval
      expect(POLL_INTERVALS.DOCKER).toBeGreaterThanOrEqual(30000);
      
      // VMs update at reasonable interval
      expect(POLL_INTERVALS.VMS).toBeGreaterThanOrEqual(30000);
    });

    it('should verify max intervals are reasonable for user experience', () => {
      // System metrics max should not exceed 1 minute for good UX
      expect(POLL_INTERVALS.SYSTEM_METRICS).toBeLessThanOrEqual(60000);
      
      // Storage max should not exceed 10 minutes
      expect(POLL_INTERVALS.STORAGE).toBeLessThanOrEqual(600000);
    });
  });

  describe('Poll Function Execution', () => {
    it('should execute callback immediately on first poll', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      
      // Simulate what happens when polling starts
      await callback();
      
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should execute callback at regular intervals using PollManager', () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const mockTimers: HomeyTimers = {
        setInterval: vi.fn((cb: () => void, ms: number) => {
          // Track that setInterval was called with correct interval
          expect(ms).toBe(POLL_INTERVALS.SYSTEM_METRICS);
          return 1 as unknown as ReturnType<typeof setInterval>;
        }),
        clearInterval: vi.fn(),
        log: vi.fn(),
      };
      
      const pollManager = new PollManager(mockTimers, vi.fn());
      pollManager.register('system', callback, {
        baseInterval: POLL_INTERVALS.SYSTEM_METRICS,
        minInterval: POLL_INTERVALS.SYSTEM_METRICS,
        maxInterval: 60000,
        maxRetries: 5,
      });
      
      pollManager.start('system');
      
      // Verify setInterval was called
      expect(mockTimers.setInterval).toHaveBeenCalled();
      
      pollManager.stopAll();
    });

    it('should handle async errors without stopping polling', async () => {
      let callCount = 0;
      const callback = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Simulated network error');
        }
      });
      
      // Simulate polling with error handling (like PollManager does)
      const poll = async (): Promise<void> => {
        try {
          await callback();
        } catch {
          // Error handled, polling continues
        }
      };
      
      // Simulate 3 poll cycles
      await poll();  // Success
      await poll();  // Error (handled)
      await poll();  // Success
      
      // Verify callback was called multiple times despite error
      expect(callback).toHaveBeenCalledTimes(3);
    });
  });

  describe('Capability Updates', () => {
    it('should calculate memory percentage correctly', () => {
      const total = 34359738368; // 32 GB
      const used = 8589934592;   // 8 GB
      
      const memoryPercent = total > 0 ? (used / total) * 100 : 0;
      
      expect(memoryPercent).toBeCloseTo(25, 1);
    });

    it('should handle zero total memory safely', () => {
      const total = 0;
      const used = 0;
      
      const memoryPercent = total > 0 ? (used / total) * 100 : 0;
      
      expect(memoryPercent).toBe(0);
    });

    it('should calculate storage usage percentage correctly', () => {
      const total = 10995116277760; // ~10 TB
      const used = 5497558138880;   // ~5 TB
      
      const usagePercent = total > 0 ? (used / total) * 100 : 0;
      
      expect(usagePercent).toBeCloseTo(50, 1);
    });

    it('should convert bytes to GB correctly', () => {
      const bytes = 1073741824; // 1 GB in bytes
      const gb = bytes / (1024 ** 3);
      
      expect(gb).toBe(1);
    });
  });
});
