/**
 * Debug script to test connection to Unraid server
 * Run with: npx ts-node scripts/debug_connection.ts
 */

import http from 'http';
import https from 'https';

const HOST = '192.168.20.21';
const API_KEY = '2264531038b0d79b429765de2c108539b13711d4c2d4427b0784e077148e9614';

const QUERY = `
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

function parseUrl(urlString: string): { hostname: string; port: number; protocol: string; path: string } | null {
  const match = urlString.match(/^(https?):\/\/([^:/]+)(?::(\d+))?(\/.*)?$/);
  if (!match) return null;
  
  const [, protocol, hostname, portStr, path] = match;
  const defaultPort = protocol === 'https' ? 443 : 80;
  const port = portStr ? parseInt(portStr, 10) : defaultPort;
  
  return { hostname, port, protocol, path: path || '/' };
}

async function discoverRedirectUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    console.log(`[1] Discovering redirect URL via HTTP GET to ${HOST}:80/graphql...`);
    
    const options: http.RequestOptions = {
      hostname: HOST,
      port: 80,
      path: '/graphql',
      method: 'GET',
    };
    
    const req = http.request(options, (res) => {
      console.log(`[1] Response status: ${res.statusCode}`);
      console.log(`[1] Headers:`, res.headers);
      
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
        const { location } = res.headers;
        if (location) {
          console.log(`[1] Found redirect to: ${location}`);
          resolve(location);
          return;
        }
      }
      
      resolve(null);
    });
    
    req.on('error', (err) => {
      console.log(`[1] Error:`, err.message);
      resolve(null);
    });
    
    req.end();
  });
}

async function makeGraphQLRequest(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n[2] Making GraphQL POST to: ${url}`);
    
    const parsed = parseUrl(url);
    if (!parsed) {
      console.log(`[2] Failed to parse URL`);
      reject(new Error('Invalid URL'));
      return;
    }
    
    const { hostname, port, protocol, path } = parsed;
    const useHttps = protocol === 'https';
    const body = JSON.stringify({ query: QUERY, variables: {} });
    
    console.log(`[2] Protocol: ${protocol}, Host: ${hostname}, Port: ${port}, Path: ${path}`);
    
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
    };
    
    if (useHttps) {
      options.rejectUnauthorized = false;
    }
    
    const protocolModule = useHttps ? https : http;
    
    const req = protocolModule.request(options, (res) => {
      console.log(`[2] Response status: ${res.statusCode} ${res.statusMessage}`);
      console.log(`[2] Response headers:`, res.headers);
      
      // Handle redirects
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
        const { location } = res.headers;
        console.log(`[2] Redirect to: ${location}`);
        if (location) {
          makeGraphQLRequest(location).then(resolve).catch(reject);
          return;
        }
      }
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`[2] Response body:`, data.substring(0, 500));
        try {
          const json = JSON.parse(data);
          console.log(`[2] Parsed JSON:`, JSON.stringify(json, null, 2));
        } catch (e) {
          console.log(`[2] Failed to parse JSON`);
        }
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log(`[2] Request error:`, err.message);
      reject(err);
    });
    
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Unraid Connection Debug ===\n');
  
  // Step 1: Discover redirect URL
  const redirectUrl = await discoverRedirectUrl();
  
  if (redirectUrl) {
    // Step 2: Make GraphQL request to redirect URL
    const parsed = parseUrl(redirectUrl);
    if (parsed) {
      const baseUrl = `${parsed.protocol}://${parsed.hostname}${parsed.port !== 443 && parsed.port !== 80 ? `:${parsed.port}` : ''}`;
      const graphqlUrl = `${baseUrl}/graphql`;
      await makeGraphQLRequest(graphqlUrl);
    }
  } else {
    console.log('\n[1] No redirect found, trying direct HTTPS...');
    await makeGraphQLRequest(`https://${HOST}/graphql`);
  }
  
  console.log('\n=== Debug Complete ===');
}

main().catch(console.error);
