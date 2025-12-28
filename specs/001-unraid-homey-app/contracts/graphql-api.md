# GraphQL API Contract: Unraid Server

**Version**: 1.0.0
**Base URL**: `http(s)://{host}/graphql`
**Authentication**: `x-api-key` header

## System Info Query

### Request

```graphql
query SystemInfo {
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
    serverName
  }
}
```

### Response

```json
{
  "data": {
    "system": {
      "cpu": {
        "usage": 15.5,
        "temperature": 42
      },
      "memory": {
        "total": 34359738368,
        "used": 8589934592,
        "free": 25769803776
      },
      "serverName": "Tower"
    }
  }
}
```

### Error Response

```json
{
  "errors": [
    {
      "message": "Not authorized",
      "extensions": {
        "code": "UNAUTHORIZED"
      }
    }
  ]
}
```

## Storage Array Query

### Request

```graphql
query StorageArray {
  array {
    state
    totalBytes
    usedBytes
    parity {
      status
      progress
    }
    disks {
      name
      health
    }
  }
}
```

### Response

```json
{
  "data": {
    "array": {
      "state": "started",
      "totalBytes": 10995116277760,
      "usedBytes": 5497558138880,
      "parity": {
        "status": "idle",
        "progress": null
      },
      "disks": [
        { "name": "disk1", "health": "healthy" },
        { "name": "disk2", "health": "healthy" },
        { "name": "parity", "health": "healthy" }
      ]
    }
  }
}
```

## Docker Containers Query

### Request

```graphql
query DockerContainers {
  docker {
    containers {
      id
      name
      running
      webUiUrl
    }
  }
}
```

### Response

```json
{
  "data": {
    "docker": {
      "containers": [
        {
          "id": "abc123",
          "name": "plex",
          "running": true,
          "webUiUrl": "http://192.168.1.100:32400/web"
        },
        {
          "id": "def456",
          "name": "nginx",
          "running": false,
          "webUiUrl": null
        }
      ]
    }
  }
}
```

## Virtual Machines Query

### Request

```graphql
query VirtualMachines {
  vms {
    id
    name
    powerState
    memoryMB
    vcpus
  }
}
```

### Response

```json
{
  "data": {
    "vms": [
      {
        "id": "vm-1",
        "name": "Windows 10",
        "powerState": "running",
        "memoryMB": 8192,
        "vcpus": 4
      },
      {
        "id": "vm-2",
        "name": "Ubuntu Server",
        "powerState": "stopped",
        "memoryMB": 4096,
        "vcpus": 2
      }
    ]
  }
}
```

## Connection Test Query

Used during pairing to validate credentials.

### Request

```graphql
query ConnectionTest {
  system {
    serverName
  }
}
```

### Response (Success)

```json
{
  "data": {
    "system": {
      "serverName": "Tower"
    }
  }
}
```

### Response (Invalid API Key)

```json
{
  "errors": [
    {
      "message": "Invalid API key",
      "extensions": {
        "code": "UNAUTHORIZED"
      }
    }
  ]
}
```

## HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Parse response |
| 302 | Redirect | Follow to new URL |
| 401 | Unauthorized | Invalid API key |
| 404 | Not Found | Wrong endpoint |
| 500 | Server Error | Retry with backoff |
| 502/503/504 | Gateway/Service Error | Retry with backoff |

## Rate Limiting

No explicit rate limits documented. Follow polling discipline:
- System metrics: Max every 30 seconds
- Storage data: Min every 5 minutes
