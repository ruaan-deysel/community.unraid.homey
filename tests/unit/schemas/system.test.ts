'use strict';

import { describe, it, expect } from 'vitest';
import {
  CpuInfoSchema,
  MemoryInfoSchema,
  MetricsSchema,
  SystemInfoSchema,
} from '../../../lib/schemas/system';

describe('SystemInfoSchema', () => {
  describe('CpuInfoSchema', () => {
    it('should parse valid CPU info (percentTotal from metrics endpoint)', () => {
      const data = { percentTotal: 45.5 };
      const result = CpuInfoSchema.parse(data);
      expect(result.percentTotal).toBe(45.5);
    });

    it('should reject percentTotal outside 0-100 range', () => {
      expect(() => CpuInfoSchema.parse({ percentTotal: -1 })).toThrow();
      expect(() => CpuInfoSchema.parse({ percentTotal: 101 })).toThrow();
    });

    it('should allow unknown fields with passthrough', () => {
      const data = { percentTotal: 50, cpus: [{ id: 0, percent: 50 }] };
      const result = CpuInfoSchema.parse(data);
      expect(result).toHaveProperty('cpus');
    });
  });

  describe('MemoryInfoSchema', () => {
    it('should parse valid memory info (Unraid API format)', () => {
      // Unraid returns BigInt as strings
      const data = { 
        total: '33328332800', 
        used: '33048924160', 
        free: '279408640',
        percentTotal: 13.17,
      };
      const result = MemoryInfoSchema.parse(data);
      expect(result.total).toBe(33328332800);
      expect(result.used).toBe(33048924160);
      expect(result.free).toBe(279408640);
      expect(result.percentTotal).toBe(13.17);
    });

    it('should handle numeric values as well as strings', () => {
      const data = { total: 32000000000, used: 16000000000, free: 16000000000, percentTotal: 50 };
      const result = MemoryInfoSchema.parse(data);
      expect(result.total).toBe(32000000000);
    });

    it('should allow unknown fields with passthrough', () => {
      const data = { total: 100, used: 50, free: 50, percentTotal: 50, buffcache: 10 };
      const result = MemoryInfoSchema.parse(data);
      expect(result).toHaveProperty('buffcache', 10);
    });
  });

  describe('MetricsSchema', () => {
    it('should parse complete metrics response', () => {
      const data = {
        cpu: { percentTotal: 25 },
        memory: { total: '100', used: '75', free: '25', percentTotal: 75 },
      };
      const result = MetricsSchema.parse(data);
      expect(result.cpu.percentTotal).toBe(25);
      expect(result.memory.percentTotal).toBe(75);
    });

    it('should allow unknown fields with passthrough', () => {
      const data = {
        cpu: { percentTotal: 10 },
        memory: { total: '100', used: '50', free: '50', percentTotal: 50 },
        uptime: 123456,
      };
      const result = MetricsSchema.parse(data);
      expect(result).toHaveProperty('uptime', 123456);
    });
  });

  describe('SystemInfoSchema', () => {
    it('should parse system info with metrics and compute cpuUsage/memoryPercent', () => {
      const data = {
        metrics: {
          cpu: { percentTotal: 25 },
          memory: { total: '100', used: '75', free: '25', percentTotal: 75 },
        },
        serverName: 'unraid-server',
      };
      const result = SystemInfoSchema.parse(data);
      expect(result.serverName).toBe('unraid-server');
      expect(result.cpuUsage).toBe(25);
      expect(result.memoryPercent).toBe(75);
    });

    it('should allow unknown fields with passthrough', () => {
      const data = {
        metrics: {
          cpu: { percentTotal: 10 },
          memory: { total: '100', used: '50', free: '50', percentTotal: 50 },
        },
        uptime: 123456,
      };
      const result = SystemInfoSchema.parse(data);
      expect(result).toHaveProperty('uptime', 123456);
    });

    it('should reject missing metrics field', () => {
      expect(() => SystemInfoSchema.parse({ serverName: 'test' })).toThrow();
    });
  });
});
