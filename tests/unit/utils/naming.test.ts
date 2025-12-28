'use strict';

import { describe, it, expect } from 'vitest';
import {
  sanitizeDeviceName,
  generateDeviceId,
  parseDeviceId,
  generateServerId,
  truncate,
  toTitleCase,
  isValidIpAddress,
  isValidHostname,
  isValidHost,
} from '../../../lib/utils/naming';

describe('naming', () => {
  describe('sanitizeDeviceName', () => {
    it('should remove special characters', () => {
      expect(sanitizeDeviceName('My Container!@#')).toBe('My Container');
    });

    it('should normalize whitespace', () => {
      expect(sanitizeDeviceName('  My   Container  ')).toBe('My Container');
    });

    it('should preserve dashes', () => {
      expect(sanitizeDeviceName('my-container')).toBe('my-container');
    });

    it('should respect max length', () => {
      expect(sanitizeDeviceName('Very Long Name', 10)).toBe('Very Long ');
    });
  });

  describe('generateDeviceId', () => {
    it('should generate consistent IDs', () => {
      const id1 = generateDeviceId('server1', 'container', 'abc123');
      const id2 = generateDeviceId('server1', 'container', 'abc123');
      expect(id1).toBe(id2);
    });

    it('should be lowercase', () => {
      const id = generateDeviceId('Server1', 'Container', 'ABC123');
      expect(id).toBe('server1:container:abc123');
    });
  });

  describe('parseDeviceId', () => {
    it('should parse valid device ID', () => {
      const result = parseDeviceId('server1:container:abc123');
      expect(result).toEqual({
        serverId: 'server1',
        resourceType: 'container',
        resourceId: 'abc123',
      });
    });

    it('should return null for invalid ID', () => {
      expect(parseDeviceId('invalid')).toBeNull();
      expect(parseDeviceId('only:two')).toBeNull();
    });
  });

  describe('generateServerId', () => {
    it('should generate server ID without port', () => {
      expect(generateServerId('192.168.1.1')).toBe('192.168.1.1');
    });

    it('should generate server ID with port', () => {
      expect(generateServerId('192.168.1.1', 443)).toBe('192.168.1.1:443');
    });

    it('should normalize hostname', () => {
      expect(generateServerId('My-Server.local')).toBe('my-server.local');
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('short', 10)).toBe('short');
    });

    it('should truncate long strings with ellipsis', () => {
      expect(truncate('very long string', 10)).toBe('very lo...');
    });

    it('should handle very short max length', () => {
      expect(truncate('test', 3)).toBe('tes');
    });
  });

  describe('toTitleCase', () => {
    it('should convert snake_case', () => {
      expect(toTitleCase('hello_world')).toBe('Hello World');
    });

    it('should convert kebab-case', () => {
      expect(toTitleCase('hello-world')).toBe('Hello World');
    });

    it('should handle single words', () => {
      expect(toTitleCase('hello')).toBe('Hello');
    });
  });

  describe('isValidIpAddress', () => {
    it('should validate IPv4 addresses', () => {
      expect(isValidIpAddress('192.168.1.1')).toBe(true);
      expect(isValidIpAddress('10.0.0.1')).toBe(true);
      expect(isValidIpAddress('255.255.255.255')).toBe(true);
    });

    it('should reject invalid IPv4 addresses', () => {
      expect(isValidIpAddress('256.1.1.1')).toBe(false);
      expect(isValidIpAddress('192.168.1')).toBe(false);
      expect(isValidIpAddress('not.an.ip')).toBe(false);
    });

    it('should validate simple IPv6 addresses', () => {
      expect(isValidIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    });
  });

  describe('isValidHostname', () => {
    it('should validate valid hostnames', () => {
      expect(isValidHostname('example.com')).toBe(true);
      expect(isValidHostname('my-server')).toBe(true);
      expect(isValidHostname('server1.local')).toBe(true);
    });

    it('should reject invalid hostnames', () => {
      expect(isValidHostname('')).toBe(false);
      expect(isValidHostname('-invalid')).toBe(false);
      expect(isValidHostname('invalid-')).toBe(false);
    });
  });

  describe('isValidHost', () => {
    it('should validate IP addresses', () => {
      expect(isValidHost('192.168.1.1')).toBe(true);
    });

    it('should validate hostnames', () => {
      expect(isValidHost('my-server.local')).toBe(true);
    });

    it('should reject invalid hosts', () => {
      expect(isValidHost('')).toBe(false);
    });
  });
});
