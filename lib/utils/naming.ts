'use strict';

/**
 * Sanitize a string for use as a device name/ID
 * Removes invalid characters and normalizes whitespace
 * 
 * @param name - The raw name string
 * @param maxLength - Maximum length (default: 50)
 * @returns Sanitized name
 */
export function sanitizeDeviceName(name: string, maxLength = 50): string {
  return name
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except dash
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .slice(0, maxLength);
}

/**
 * Generate a device ID from container/VM ID
 * Ensures consistent IDs across pairing sessions
 * 
 * @param serverId - The server identifier
 * @param resourceType - Type of resource (container, vm, etc.)
 * @param resourceId - The resource's native ID
 * @returns Consistent device ID
 */
export function generateDeviceId(
  serverId: string,
  resourceType: string,
  resourceId: string,
): string {
  // Create a deterministic ID that persists across sessions
  return `${serverId}:${resourceType}:${resourceId}`.toLowerCase();
}

/**
 * Parse a device ID back into components
 * 
 * @param deviceId - The device ID string
 * @returns Parsed components or null if invalid
 */
export function parseDeviceId(deviceId: string): {
  serverId: string;
  resourceType: string;
  resourceId: string;
} | null {
  const parts = deviceId.split(':');
  if (parts.length !== 3) return null;
  
  return {
    serverId: parts[0],
    resourceType: parts[1],
    resourceId: parts[2],
  };
}

/**
 * Generate a unique server ID from host/port
 * 
 * @param host - Server hostname or IP
 * @param port - Server port (optional)
 * @returns Server identifier
 */
export function generateServerId(host: string, port?: number): string {
  const normalizedHost = host.toLowerCase().replace(/[^a-z0-9.-]/g, '');
  return port ? `${normalizedHost}:${port}` : normalizedHost;
}

/**
 * Truncate a string with ellipsis if too long
 * 
 * @param str - String to truncate
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  if (maxLength <= 3) return str.slice(0, maxLength);
  return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Convert snake_case or kebab-case to Title Case
 * 
 * @param str - Input string
 * @returns Title Case string
 */
export function toTitleCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Validate IP address format
 * 
 * @param ip - IP address string
 * @returns True if valid IPv4 or IPv6
 */
export function isValidIpAddress(ip: string): boolean {
  // IPv4 pattern
  const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|1?\d\d?)$/;
  // Basic IPv6 pattern (simplified)
  const ipv6 = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$/;
  
  return ipv4.test(ip) || ipv6.test(ip);
}

/**
 * Validate hostname format
 * 
 * @param hostname - Hostname string
 * @returns True if valid hostname
 */
export function isValidHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253) return false;
  
  // Each label must be 1-63 characters, alphanumeric with dashes (not leading/trailing)
  const labelPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  const labels = hostname.split('.');
  
  return labels.every(label => labelPattern.test(label));
}

/**
 * Check if host is valid (IP or hostname)
 * 
 * @param host - Host string
 * @returns True if valid IP or hostname
 */
export function isValidHost(host: string): boolean {
  return isValidIpAddress(host) || isValidHostname(host);
}
