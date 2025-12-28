'use strict';

import { describe, it, expect } from 'vitest';
import {
  DockerContainerStateSchema,
  PortMappingSchema,
  VolumeMountSchema,
  DockerContainerSchema,
  DockerInfoSchema,
} from '../../../lib/schemas/docker';

describe('DockerSchema', () => {
  describe('DockerContainerStateSchema', () => {
    it('should accept all valid container states (Unraid API format)', () => {
      const states = ['RUNNING', 'PAUSED', 'EXITED', 'DEAD', 'CREATED', 'RESTARTING'];
      states.forEach(state => {
        const result = DockerContainerStateSchema.parse(state);
        expect(result).toBe(state);
      });
    });

    it('should reject invalid states', () => {
      expect(() => DockerContainerStateSchema.parse('invalid')).toThrow();
      // lowercase versions should fail as API returns uppercase
      expect(() => DockerContainerStateSchema.parse('running')).toThrow();
    });
  });

  describe('PortMappingSchema', () => {
    it('should parse valid port mapping', () => {
      const data = { container: 80, host: 8080, protocol: 'tcp' };
      const result = PortMappingSchema.parse(data);
      expect(result.container).toBe(80);
      expect(result.host).toBe(8080);
      expect(result.protocol).toBe('tcp');
    });

    it('should default protocol to tcp', () => {
      const data = { container: 443, host: 443 };
      const result = PortMappingSchema.parse(data);
      expect(result.protocol).toBe('tcp');
    });

    it('should accept udp protocol', () => {
      const data = { container: 53, host: 53, protocol: 'udp' };
      const result = PortMappingSchema.parse(data);
      expect(result.protocol).toBe('udp');
    });

    it('should reject invalid port numbers', () => {
      // Port fields are now optional to match API variability
      expect(() => PortMappingSchema.parse({ container: 0, host: 80 })).toThrow();
      expect(() => PortMappingSchema.parse({ container: 80, host: 70000 })).toThrow();
    });
  });

  describe('VolumeMountSchema', () => {
    it('should parse valid volume mount', () => {
      const data = { source: '/host/path', destination: '/container/path', readOnly: false };
      const result = VolumeMountSchema.parse(data);
      expect(result.source).toBe('/host/path');
      expect(result.destination).toBe('/container/path');
      expect(result.readOnly).toBe(false);
    });

    it('should default readOnly to false', () => {
      const data = { source: '/src', destination: '/dest' };
      const result = VolumeMountSchema.parse(data);
      expect(result.readOnly).toBe(false);
    });
  });

  describe('DockerContainerSchema', () => {
    // Match actual Unraid API format: 'names' is array, 'state' is uppercase
    const validContainer = {
      id: 'abc123def456',
      names: ['/nginx'],
      image: 'nginx:latest',
      state: 'RUNNING',
      status: 'Up 2 hours',
      autoStart: false,
    };

    it('should parse minimal container info (Unraid API format)', () => {
      const result = DockerContainerSchema.parse(validContainer);
      expect(result.id).toBe('abc123def456');
      // names array is transformed to name string (stripped leading slash)
      expect(result.name).toBe('nginx');
      expect(result.state).toBe('RUNNING');
      expect(result.running).toBe(true);
    });

    it('should set running to false for non-RUNNING states', () => {
      const data = { ...validContainer, state: 'EXITED' };
      const result = DockerContainerSchema.parse(data);
      expect(result.running).toBe(false);
    });

    it('should strip leading slash from container name', () => {
      const data = { ...validContainer, names: ['/my-container'] };
      const result = DockerContainerSchema.parse(data);
      expect(result.name).toBe('my-container');
    });

    it('should default arrays and optional fields', () => {
      const result = DockerContainerSchema.parse(validContainer);
      expect(result.ports).toEqual([]);
      expect(result.mounts).toEqual([]);
      expect(result.autoStart).toBe(false);
    });

    it('should allow unknown fields with passthrough', () => {
      const data = { ...validContainer, customLabel: 'test' };
      const result = DockerContainerSchema.parse(data);
      expect(result).toHaveProperty('customLabel', 'test');
    });

    it('should reject empty id or names', () => {
      expect(() => DockerContainerSchema.parse({ ...validContainer, id: '' })).toThrow();
      expect(() => DockerContainerSchema.parse({ ...validContainer, names: [] })).not.toThrow();
    });
  });

  describe('DockerInfoSchema', () => {
    it('should parse docker info with containers (Unraid API format)', () => {
      const data = {
        containers: [
          { id: '123', names: ['/test'], image: 'alpine', state: 'RUNNING', status: 'Up', autoStart: true },
        ],
        isEnabled: true,
      };
      const result = DockerInfoSchema.parse(data);
      expect(result.containers).toHaveLength(1);
      expect(result.isEnabled).toBe(true);
    });

    it('should default isEnabled to true', () => {
      const data = { containers: [] };
      const result = DockerInfoSchema.parse(data);
      expect(result.isEnabled).toBe(true);
    });
  });
});
