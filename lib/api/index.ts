'use strict';

/**
 * API module index - exports all API-related functionality
 */

// Client
export { executeQuery, testConnection } from './client';
export type { UnraidClientConfig, QueryResult } from './client';

// Queries
export {
  SYSTEM_INFO_QUERY,
  STORAGE_INFO_QUERY,
  DOCKER_CONTAINERS_QUERY,
  VMS_QUERY,
  START_CONTAINER_MUTATION,
  STOP_CONTAINER_MUTATION,
  RESTART_CONTAINER_MUTATION,
  START_VM_MUTATION,
  STOP_VM_MUTATION,
  PAUSE_VM_MUTATION,
  RESUME_VM_MUTATION,
  ARRAY_OPERATION_MUTATION,
} from './queries';

// Types
export * from './types';
