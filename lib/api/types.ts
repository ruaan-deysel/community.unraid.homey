'use strict';

/**
 * Re-exported types for API consumers
 */

// Re-export client types
export type { UnraidClientConfig, QueryResult } from './client';

// Re-export from schemas
export type {
  SystemInfo,
  CpuInfo,
  MemoryInfo,
} from '../schemas/system';

export type {
  StorageInfo,
  StorageArray,
  Disk,
  Share,
  ArrayCapacity,
  ParityCheckStatus,
} from '../schemas/storage';

export type {
  DockerInfo,
  DockerContainer,
  DockerContainerState,
  PortMapping,
  VolumeMount,
} from '../schemas/docker';

export type {
  VMInfo,
  VirtualMachine,
  VMState,
  VMDisk,
  VMNetwork,
} from '../schemas/vm';

export type {
  ErrorCode,
  ApiError,
  GraphQLError,
} from '../schemas/errors';
