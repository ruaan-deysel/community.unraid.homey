'use strict';

import { describe, it, expect } from 'vitest';
import {
  DiskSchema,
  ArrayCapacitySchema,
  ParityCheckStatusSchema,
  StorageArraySchema,
  ShareSchema,
  StorageInfoSchema,
} from '../../../lib/schemas/storage';

describe('StorageSchema', () => {
  describe('DiskSchema', () => {
    it('should parse valid disk info (Unraid API format)', () => {
      const data = {
        name: 'disk1',
        status: 'DISK_OK',
        temp: 36,
        numErrors: 0,
      };
      const result = DiskSchema.parse(data);
      expect(result.name).toBe('disk1');
      expect(result.status).toBe('DISK_OK');
      expect(result.temp).toBe(36);
    });

    it('should accept null temperature', () => {
      const data = {
        name: 'disk1',
        status: 'DISK_OK',
        temp: null,
      };
      const result = DiskSchema.parse(data);
      expect(result.temp).toBeNull();
    });

    it('should allow unknown fields with passthrough', () => {
      const data = {
        name: 'disk1',
        status: 'DISK_OK',
        temp: 40,
        serialNumber: 'ABC123',
      };
      const result = DiskSchema.parse(data);
      expect(result).toHaveProperty('serialNumber', 'ABC123');
    });
  });

  describe('ArrayCapacitySchema', () => {
    it('should parse capacity with kilobytes (Unraid API format)', () => {
      // Unraid returns kilobytes as strings
      const data = {
        kilobytes: {
          free: '27549286339',
          used: '14447023911',
          total: '41996310250',
        },
      };
      const result = ArrayCapacitySchema.parse(data);
      expect(result.kilobytes.free).toBe(27549286339);
      expect(result.kilobytes.used).toBe(14447023911);
      expect(result.kilobytes.total).toBe(41996310250);
    });
  });

  describe('ParityCheckStatusSchema', () => {
    it('should parse parity check status', () => {
      const data = {
        status: 'IDLE',
        progress: null,
        running: false,
        errors: 0,
      };
      const result = ParityCheckStatusSchema.parse(data);
      expect(result.status).toBe('IDLE');
      expect(result.running).toBe(false);
    });
  });

  describe('StorageArraySchema', () => {
    it('should parse storage array with computed usagePercent (Unraid API format)', () => {
      const data = {
        state: 'STARTED',
        capacity: {
          kilobytes: {
            free: '250000',
            used: '750000',
            total: '1000000',
          },
        },
        parityCheckStatus: {
          status: 'IDLE',
          progress: null,
          running: false,
        },
        disks: [],
      };
      const result = StorageArraySchema.parse(data);
      expect(result.usagePercent).toBe(75);
      expect(result.state).toBe('STARTED');
    });

    it('should compute usagePercent as 0 when totalSize is 0', () => {
      const data = {
        state: 'STOPPED',
        capacity: {
          kilobytes: {
            free: '0',
            used: '0',
            total: '0',
          },
        },
        parityCheckStatus: {
          status: 'IDLE',
          progress: null,
          running: false,
        },
        disks: [],
      };
      const result = StorageArraySchema.parse(data);
      expect(result.usagePercent).toBe(0);
    });

    it('should accept all valid state values (Unraid API format)', () => {
      const states = ['STARTED', 'STOPPED', 'STOPPING', 'STARTING'];
      states.forEach(state => {
        const data = {
          state,
          capacity: {
            kilobytes: { free: '50', used: '50', total: '100' },
          },
          parityCheckStatus: { status: 'IDLE', progress: null, running: false },
          disks: [],
        };
        const result = StorageArraySchema.parse(data);
        expect(result.state).toBe(state);
      });
    });
  });

  describe('ShareSchema', () => {
    it('should parse share with required fields', () => {
      const data = {
        name: 'appdata',
        comment: 'Application data',
      };
      const result = ShareSchema.parse(data);
      expect(result.name).toBe('appdata');
      expect(result.comment).toBe('Application data');
    });

    it('should allow optional size fields (as strings or numbers)', () => {
      const data = {
        name: 'media',
        comment: 'Media files',
        free: '1000000',
        used: '500000',
      };
      const result = ShareSchema.parse(data);
      expect(result.free).toBe(1000000);
      expect(result.used).toBe(500000);
    });

    it('should allow optional size fields as numbers', () => {
      const data = {
        name: 'media',
        free: 1000000,
        used: 500000,
      };
      const result = ShareSchema.parse(data);
      expect(result.free).toBe(1000000);
    });
  });

  describe('StorageInfoSchema', () => {
    it('should parse complete storage info (Unraid API format)', () => {
      const data = {
        array: {
          state: 'STARTED',
          capacity: {
            kilobytes: { free: '500', used: '500', total: '1000' },
          },
          parityCheckStatus: { status: 'IDLE', progress: null, running: false },
          disks: [{ name: 'disk1', status: 'DISK_OK', temp: 35 }],
        },
        shares: [
          { name: 'share1', comment: 'Test share' },
        ],
      };
      const result = StorageInfoSchema.parse(data);
      expect(result.array.usagePercent).toBe(50);
      expect(result.shares).toHaveLength(1);
    });
  });
});
