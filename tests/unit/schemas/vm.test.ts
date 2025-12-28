'use strict';

import { describe, it, expect } from 'vitest';
import {
  VMStateSchema,
  VMDiskSchema,
  VMNetworkSchema,
  VirtualMachineSchema,
  VMInfoSchema,
} from '../../../lib/schemas/vm';

describe('VMSchema', () => {
  describe('VMStateSchema', () => {
    it('should accept all valid VM states (Unraid API format - uppercase)', () => {
      const states = ['RUNNING', 'PAUSED', 'SHUTOFF', 'PMSUSPENDED', 'IDLE', 'CRASHED', 'BLOCKED', 'SHUTDOWN', 'NOSTATE'];
      states.forEach(state => {
        const result = VMStateSchema.parse(state);
        expect(result).toBe(state);
      });
    });

    it('should specifically support PAUSED state (I3 remediation)', () => {
      const result = VMStateSchema.parse('PAUSED');
      expect(result).toBe('PAUSED');
    });

    it('should reject invalid states', () => {
      expect(() => VMStateSchema.parse('invalid')).toThrow();
      // lowercase should fail - API returns uppercase
      expect(() => VMStateSchema.parse('running')).toThrow();
    });
  });

  describe('VMDiskSchema', () => {
    it('should parse valid VM disk', () => {
      const data = { path: '/mnt/user/domains/vm/disk.qcow2', size: 107374182400, driver: 'qcow2' };
      const result = VMDiskSchema.parse(data);
      expect(result.path).toBe('/mnt/user/domains/vm/disk.qcow2');
      expect(result.driver).toBe('qcow2');
    });

    it('should default driver to qcow2', () => {
      const data = { path: '/path/disk.img', size: 100000 };
      const result = VMDiskSchema.parse(data);
      expect(result.driver).toBe('qcow2');
    });

    it('should accept all valid drivers', () => {
      // Note: API may return various drivers, schema now allows any string
      const drivers = ['raw', 'qcow2', 'vhd', 'other'];
      drivers.forEach(driver => {
        const data = { path: '/path/disk', size: 100, driver };
        const result = VMDiskSchema.parse(data);
        expect(result.driver).toBe(driver);
      });
    });
  });

  describe('VMNetworkSchema', () => {
    it('should parse valid network interface', () => {
      const data = { mac: '52:54:00:12:34:56', bridge: 'br0', model: 'virtio' };
      const result = VMNetworkSchema.parse(data);
      expect(result.mac).toBe('52:54:00:12:34:56');
      expect(result.bridge).toBe('br0');
    });

    it('should default model to virtio', () => {
      const data = { mac: '52:54:00:12:34:56', bridge: 'br0' };
      const result = VMNetworkSchema.parse(data);
      expect(result.model).toBe('virtio');
    });
  });

  describe('VirtualMachineSchema', () => {
    // Note: Unraid API only provides id, name, and state for VMs
    const validVM = {
      id: 'vm-1',
      name: 'Ubuntu Server',
      state: 'RUNNING',
    };

    it('should parse minimal VM info (Unraid API format)', () => {
      const result = VirtualMachineSchema.parse(validVM);
      expect(result.id).toBe('vm-1');
      expect(result.name).toBe('Ubuntu Server');
      expect(result.state).toBe('RUNNING');
    });

    it('should add powerState alias for vm_power_state capability (A4 remediation)', () => {
      const result = VirtualMachineSchema.parse(validVM);
      expect(result.powerState).toBe('RUNNING');
    });

    it('should handle PAUSED state for vm_power_state (I3 + A4)', () => {
      const data = { ...validVM, state: 'PAUSED' };
      const result = VirtualMachineSchema.parse(data);
      expect(result.state).toBe('PAUSED');
      expect(result.powerState).toBe('PAUSED');
    });

    it('should handle SHUTOFF state', () => {
      const data = { ...validVM, state: 'SHUTOFF' };
      const result = VirtualMachineSchema.parse(data);
      expect(result.state).toBe('SHUTOFF');
      expect(result.powerState).toBe('SHUTOFF');
    });

    it('should allow unknown fields with passthrough', () => {
      const data = { ...validVM, graphics: 'vnc' };
      const result = VirtualMachineSchema.parse(data);
      expect(result).toHaveProperty('graphics', 'vnc');
    });

    it('should reject empty id', () => {
      expect(() => VirtualMachineSchema.parse({ ...validVM, id: '' })).toThrow();
    });

    it('should handle null name and use id as fallback', () => {
      const data = { id: 'vm-1', name: null, state: 'RUNNING' };
      const result = VirtualMachineSchema.parse(data);
      expect(result.name).toBe('vm-1');
    });
  });

  describe('VMInfoSchema', () => {
    it('should parse VM info with domain array (Unraid API format)', () => {
      const data = {
        domain: [
          { id: 'vm-1', name: 'Test VM', state: 'SHUTOFF' },
        ],
      };
      const result = VMInfoSchema.parse(data);
      // Schema transforms 'domain' to 'vms' for backward compatibility
      expect(result.vms).toHaveLength(1);
      expect(result.isEnabled).toBe(true);
    });

    it('should default isEnabled to true', () => {
      const data = { domain: [] };
      const result = VMInfoSchema.parse(data);
      expect(result.isEnabled).toBe(true);
    });
  });
});
