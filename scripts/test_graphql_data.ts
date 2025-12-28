/**
 * Test script to explore available GraphQL data from Unraid
 * Run with: npx tsx scripts/test_graphql_data.ts
 */

import http from 'http';
import https from 'https';

const HOST = '192.168.20.21';
const API_KEY = '2264531038b0d79b429765de2c108539b13711d4c2d4427b0784e077148e9614';
const TIMEOUT = 15000;

interface ParsedUrl {
  hostname: string;
  port: number;
  protocol: string;
  path: string;
}

function parseUrl(urlString: string): ParsedUrl | null {
  try {
    const match = urlString.match(/^(https?):\/\/([^:/]+)(?::(\d+))?(\/.*)?$/);
    if (!match) return null;
    
    const [, protocol, hostname, portStr, path] = match;
    const defaultPort = protocol === 'https' ? 443 : 80;
    const port = portStr ? parseInt(portStr, 10) : defaultPort;
    
    return { hostname, port, protocol, path: path || '/' };
  } catch {
    return null;
  }
}

async function discoverRedirectUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname: HOST,
      port: 80,
      path: '/graphql',
      method: 'GET',
    };
    
    // eslint-disable-next-line homey-app/global-timers -- This is a standalone test script, not a Homey app
    const timeoutId = setTimeout(() => resolve(null), TIMEOUT);
    
    const req = http.request(options, (res) => {
      clearTimeout(timeoutId);
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
        const { location } = res.headers;
        if (location) {
          resolve(location);
          return;
        }
      }
      resolve(null);
    });
    
    req.on('error', () => {
      clearTimeout(timeoutId);
      resolve(null);
    });
    
    req.end();
  });
}

async function makeGraphQLRequest(url: string, query: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = parseUrl(url);
    if (!parsed) {
      reject(new Error('Failed to parse URL'));
      return;
    }
    
    const { hostname, port, protocol, path } = parsed;
    const useHttps = protocol === 'https';
    const body = JSON.stringify({ query, variables: {} });
    
    const options: https.RequestOptions = {
      hostname,
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
      rejectUnauthorized: false,
    };
    
    const client = useHttps ? https : http;
    
    // eslint-disable-next-line homey-app/global-timers -- This is a standalone test script, not a Homey app
    const timeoutId = setTimeout(() => reject(new Error('Timeout')), TIMEOUT);
    
    const req = client.request(options, (res) => {
      clearTimeout(timeoutId);
      
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function testQuery(name: string, query: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(60));
  
  try {
    const url = await discoverRedirectUrl() || `https://${HOST}/graphql`;
    const result = await makeGraphQLRequest(url, query);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
  }
}

async function main() {
  console.log('GraphQL Data Explorer for Unraid');
  console.log(`Host: ${HOST}`);
  
  // Test 1: System metrics (current query)
  await testQuery('System Metrics', `
    query {
      metrics {
        cpu {
          percentTotal
        }
        memory {
          total
          used
          free
          percentTotal
        }
      }
    }
  `);
  
  // Test 2: Full system info including temperatures
  await testQuery('Full System Info', `
    query {
      info {
        os {
          hostname
          uptime
        }
        cpu {
          model
          cores
        }
        versions {
          core {
            unraid
          }
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
  `);
  
  // Test 3: Array/Storage info
  await testQuery('Array/Storage Info', `
    query {
      array {
        state
        capacity {
          kilobytes {
            free
            used
            total
          }
        }
        parityCheckStatus {
          status
          progress
          running
        }
        disks {
          name
          status
          temp
          device
          size
          type
          slot
        }
      }
    }
  `);
  
  // Test 4: Try alternative CPU temperature queries
  await testQuery('CPU Temperature Alternative', `
    query {
      info {
        cpu {
          model
          cores
        }
      }
      metrics {
        cpu {
          percentTotal
        }
        cpuTemp {
          value
          unit
        }
      }
    }
  `);
  
  // Test 5: Try sensors/temperature data
  await testQuery('Sensors Data', `
    query {
      sensors {
        temperature {
          label
          value
          unit
        }
      }
    }
  `);
  
  // Test 6: Introspection - find all available queries
  await testQuery('Available Queries (Introspection)', `
    query {
      __schema {
        queryType {
          fields {
            name
            description
          }
        }
      }
    }
  `);
}

main().catch(console.error);
