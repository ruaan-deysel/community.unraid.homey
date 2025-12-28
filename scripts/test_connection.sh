#!/bin/bash
# Test script to verify the Unraid GraphQL connection works
# Usage: ./scripts/test_connection.sh <host> <api_key> [port]

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <host> <api_key> [port]"
    echo "Example: $0 192.168.1.100 your-api-key-here 443"
    exit 1
fi

HOST="$1"
API_KEY="$2"
PORT="${3:-443}"

echo "Testing connection to Unraid server..."
echo "Host: $HOST"
echo "Port: $PORT"
echo ""

# Test with curl
echo "=== Testing with curl ==="
curl -k -s -X POST "https://${HOST}:${PORT}/graphql" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"query":"query { online }"}' \
  --connect-timeout 10 \
  --max-time 30

echo ""
echo ""
echo "=== Testing info query ==="
curl -k -s -X POST "https://${HOST}:${PORT}/graphql" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"query":"query { info { os { hostname uptime } versions { unraid } } }"}' \
  --connect-timeout 10 \
  --max-time 30

echo ""
