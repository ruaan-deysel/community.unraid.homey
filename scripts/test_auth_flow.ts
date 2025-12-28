/**
 * Test script to mimic the authentication flow for Unraid server
 * This tests the same flow that the Homey app pairing should use
 * 
 * Run with: npx ts-node scripts/test_auth_flow.ts
 */

import http from 'http';
import https from 'https';

const HOST = '192.168.20.21';
const API_KEY = '2264531038b0d79b429765de2c108539b13711d4c2d4427b0784e077148e9614';
const TIMEOUT = 15000;

const SERVER_INFO_QUERY = `
  query {
    info {
      os {
        hostname
        uptime
      }
      versions {
        core {
          unraid
        }
      }
    }
  }
`;

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
    console.log(`\n[Step 1] Discovering redirect URL via HTTP GET to ${HOST}:80/graphql`);
    
    const options: http.RequestOptions = {
      hostname: HOST,
      port: 80,
      path: '/graphql',
      method: 'GET',
    };
    
    // eslint-disable-next-line homey-app/global-timers -- This is a standalone test script, not a Homey app
    const timeoutId = setTimeout(() => {
      console.log('[Step 1] Timeout - no redirect found');
      resolve(null);
    }, TIMEOUT);
    
    const req = http.request(options, (res) => {
      clearTimeout(timeoutId);
      console.log(`[Step 1] Response status: ${res.statusCode}`);
      
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
        const { location } = res.headers;
        if (location) {
          console.log(`[Step 1] ✓ Found redirect to: ${location}`);
          resolve(location);
          return;
        }
      }
      
      console.log('[Step 1] No redirect found');
      resolve(null);
    });
    
    req.on('error', (err) => {
      clearTimeout(timeoutId);
      console.log(`[Step 1] Error: ${err.message}`);
      resolve(null);
    });
    
    req.end();
  });
}

async function makeGraphQLRequest(url: string, query: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    console.log(`\n[Step 2] Making GraphQL POST to: ${url}`);
    
    const parsed = parseUrl(url);
    if (!parsed) {
      reject(new Error('Failed to parse URL'));
      return;
    }
    
    const { hostname, port, protocol, path } = parsed;
    const useHttps = protocol === 'https';
    const body = JSON.stringify({ query, variables: {} });
    
    console.log(`[Step 2] Protocol: ${protocol}, Host: ${hostname}, Port: ${port}, Path: ${path}`);
    console.log(`[Step 2] Using API key: ${API_KEY.substring(0, 8)}...`);
    
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
      rejectUnauthorized: false, // Allow self-signed certs
    };
    
    const client = useHttps ? https : http;
    
    // eslint-disable-next-line homey-app/global-timers -- This is a standalone test script, not a Homey app
    const timeoutId = setTimeout(() => {
      console.log('[Step 2] Request timeout');
      reject(new Error('Request timeout'));
    }, TIMEOUT);
    
    const req = client.request(options, (res) => {
      clearTimeout(timeoutId);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`[Step 2] Response status: ${res.statusCode}`);
        
        if (res.statusCode !== 200) {
          console.log(`[Step 2] ✗ HTTP Error: ${res.statusCode}`);
          console.log(`[Step 2] Response body: ${data}`);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        try {
          const json = JSON.parse(data);
          console.log(`[Step 2] ✓ Response received`);
          resolve(json);
        } catch (err) {
          console.log(`[Step 2] ✗ Failed to parse JSON: ${data}`);
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    
    req.on('error', (err) => {
      clearTimeout(timeoutId);
      console.log(`[Step 2] ✗ Request error: ${err.message}`);
      reject(err);
    });
    
    req.write(body);
    req.end();
  });
}

async function testDirectHttps(): Promise<unknown> {
  const url = `https://${HOST}/graphql`;
  console.log(`\n[Alternative] Trying direct HTTPS to ${url}`);
  
  return makeGraphQLRequest(url, SERVER_INFO_QUERY);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Unraid Authentication Flow Test');
  console.log('='.repeat(60));
  console.log(`Host: ${HOST}`);
  console.log(`API Key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 8)}`);
  console.log('='.repeat(60));
  
  try {
    // Step 1: Discover redirect URL
    const redirectUrl = await discoverRedirectUrl();
    
    let result: unknown;
    
    if (redirectUrl) {
      // Step 2: Make GraphQL request to redirect URL
      result = await makeGraphQLRequest(redirectUrl, SERVER_INFO_QUERY);
    } else {
      // Fallback: Try direct HTTPS
      console.log('\n[Fallback] No redirect found, trying direct HTTPS...');
      result = await testDirectHttps();
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('SUCCESS! Server Info:');
    console.log('='.repeat(60));
    console.log(JSON.stringify(result, null, 2));
    
    // Extract server info
    const data = result as { data?: { info?: { os?: { hostname?: string; uptime?: string }; versions?: { core?: { unraid?: string } } } } };
    if (data.data?.info) {
      const { os, versions } = data.data.info;
      console.log(`\n${'-'.repeat(40)}`);
      console.log('Parsed Server Info:');
      console.log('-'.repeat(40));
      console.log(`  Hostname: ${os?.hostname || 'N/A'}`);
      console.log(`  Uptime: ${os?.uptime || 'N/A'}`);
      console.log(`  Unraid Version: ${versions?.core?.unraid || 'N/A'}`);
    }
    
  } catch (err) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('FAILED!');
    console.log('='.repeat(60));
    console.error('Error:', err instanceof Error ? err.message : err);
    throw new Error('Authentication flow test failed');
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
