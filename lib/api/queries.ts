'use strict';

/**
 * GraphQL query definitions for Unraid API
 */

/**
 * Query to fetch system information (CPU, memory, server name)
 */
export const SYSTEM_INFO_QUERY = `
  query SystemInfo {
    info {
      os {
        hostname
      }
    }
    system {
      cpu {
        usage
        temperature
      }
      memory {
        total
        used
        free
      }
    }
  }
`;

/**
 * Query to fetch storage array information
 */
export const STORAGE_INFO_QUERY = `
  query StorageInfo {
    array {
      state
      capacity {
        total
        used
        free
      }
      disks {
        name
        device
        size
        used
        free
        status
        temp
        type
        slot
      }
    }
    shares {
      name
      path
      size
      used
      free
      useCache
    }
  }
`;

/**
 * Query to fetch Docker containers
 */
export const DOCKER_CONTAINERS_QUERY = `
  query DockerContainers {
    docker {
      containers {
        id
        name
        image
        state
        status
        created
        autoStart
        stats {
          cpuPercent
          memoryUsage
          memoryLimit
          networkRx
          networkTx
        }
        ports {
          container
          host
          protocol
        }
        mounts {
          source
          destination
          readOnly
        }
      }
    }
  }
`;

/**
 * Query to fetch VMs
 */
export const VMS_QUERY = `
  query VirtualMachines {
    vms {
      id
      name
      state
      description
      memory
      vcpus
      cpuUsage
      autoStart
      disks {
        path
        size
        driver
      }
      networks {
        mac
        bridge
        model
      }
    }
  }
`;

/**
 * Mutation to start a Docker container
 */
export const START_CONTAINER_MUTATION = `
  mutation StartContainer($id: ID!) {
    dockerContainerStart(id: $id) {
      id
      state
    }
  }
`;

/**
 * Mutation to stop a Docker container
 */
export const STOP_CONTAINER_MUTATION = `
  mutation StopContainer($id: ID!) {
    dockerContainerStop(id: $id) {
      id
      state
    }
  }
`;

/**
 * Mutation to restart a Docker container
 */
export const RESTART_CONTAINER_MUTATION = `
  mutation RestartContainer($id: ID!) {
    dockerContainerRestart(id: $id) {
      id
      state
    }
  }
`;

/**
 * Mutation to start a VM
 */
export const START_VM_MUTATION = `
  mutation StartVM($id: ID!) {
    vmStart(id: $id) {
      id
      state
    }
  }
`;

/**
 * Mutation to stop a VM
 */
export const STOP_VM_MUTATION = `
  mutation StopVM($id: ID!) {
    vmStop(id: $id) {
      id
      state
    }
  }
`;

/**
 * Mutation to pause a VM (I3 remediation - paused state)
 */
export const PAUSE_VM_MUTATION = `
  mutation PauseVM($id: ID!) {
    vmPause(id: $id) {
      id
      state
    }
  }
`;

/**
 * Mutation to resume a VM (I3 remediation - paused state)
 */
export const RESUME_VM_MUTATION = `
  mutation ResumeVM($id: ID!) {
    vmResume(id: $id) {
      id
      state
    }
  }
`;

/**
 * Query to start/stop the array
 */
export const ARRAY_OPERATION_MUTATION = `
  mutation ArrayOperation($action: ArrayAction!) {
    arrayAction(action: $action) {
      state
    }
  }
`;
