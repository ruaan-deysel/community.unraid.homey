'use strict';

import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  parseBytes,
  formatPercent,
  formatTemperature,
  formatUptime,
  clamp,
  round,
} from '../../../lib/utils/formatters';

describe('formatters', () => {
  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('should format KB correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format MB correctly', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
    });

    it('should format GB correctly', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('should format TB correctly', () => {
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });

    it('should respect decimal places', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 3)).toBe('1.5 KB');
    });

    it('should handle invalid inputs', () => {
      expect(formatBytes(Infinity)).toBe('Invalid');
      expect(formatBytes(-100)).toBe('Invalid');
      expect(formatBytes(NaN)).toBe('Invalid');
    });
  });

  describe('parseBytes', () => {
    it('should parse bytes', () => {
      expect(parseBytes('100 bytes')).toBe(100);
      expect(parseBytes('100 Bytes')).toBe(100);
    });

    it('should parse KB', () => {
      expect(parseBytes('1 KB')).toBe(1024);
      expect(parseBytes('1.5 kb')).toBe(1536);
    });

    it('should parse MB', () => {
      expect(parseBytes('1 MB')).toBe(1048576);
    });

    it('should parse GB', () => {
      expect(parseBytes('1 GB')).toBe(1073741824);
    });

    it('should parse TB', () => {
      expect(parseBytes('1 TB')).toBe(1099511627776);
    });

    it('should handle no unit as bytes', () => {
      expect(parseBytes('100')).toBe(100);
    });

    it('should return null for invalid input', () => {
      expect(parseBytes('invalid')).toBeNull();
      expect(parseBytes('-1 GB')).toBeNull();
      expect(parseBytes('')).toBeNull();
    });
  });

  describe('formatPercent', () => {
    it('should format percentages', () => {
      expect(formatPercent(75)).toBe('75.0%');
      expect(formatPercent(33.333)).toBe('33.3%');
    });

    it('should respect decimal places', () => {
      expect(formatPercent(33.333, 2)).toBe('33.33%');
      expect(formatPercent(33.333, 0)).toBe('33%');
    });

    it('should handle invalid input', () => {
      expect(formatPercent(NaN)).toBe('N/A');
      expect(formatPercent(Infinity)).toBe('N/A');
    });
  });

  describe('formatTemperature', () => {
    it('should format temperature', () => {
      expect(formatTemperature(45)).toBe('45°C');
      expect(formatTemperature(45.6)).toBe('46°C');
    });

    it('should handle null', () => {
      expect(formatTemperature(null)).toBe('N/A');
    });

    it('should handle invalid input', () => {
      expect(formatTemperature(NaN)).toBe('N/A');
    });
  });

  describe('formatUptime', () => {
    it('should format minutes only', () => {
      expect(formatUptime(300)).toBe('5m');
    });

    it('should format hours and minutes', () => {
      expect(formatUptime(3900)).toBe('1h 5m');
    });

    it('should format days, hours, and minutes', () => {
      expect(formatUptime(90300)).toBe('1d 1h 5m');
    });

    it('should handle zero', () => {
      expect(formatUptime(0)).toBe('0m');
    });

    it('should handle invalid input', () => {
      expect(formatUptime(-100)).toBe('Unknown');
      expect(formatUptime(NaN)).toBe('Unknown');
    });
  });

  describe('clamp', () => {
    it('should clamp values', () => {
      expect(clamp(50, 0, 100)).toBe(50);
      expect(clamp(-10, 0, 100)).toBe(0);
      expect(clamp(150, 0, 100)).toBe(100);
    });
  });

  describe('round', () => {
    it('should round to decimal places', () => {
      expect(round(3.14159, 2)).toBe(3.14);
      expect(round(3.14159, 4)).toBe(3.1416);
      expect(round(3.14159, 0)).toBe(3);
    });
  });
});
