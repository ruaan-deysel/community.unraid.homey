'use strict';

/**
 * Format bytes to human readable string
 * 
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.5 GB")
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  if (!Number.isFinite(bytes)) return 'Invalid';
  if (bytes < 0) return 'Invalid';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeIndex = Math.min(i, sizes.length - 1);
  
  return `${parseFloat((bytes / (k ** safeIndex)).toFixed(dm))} ${sizes[safeIndex]}`;
}

/**
 * Parse bytes from human readable string
 * 
 * @param str - Human readable string (e.g., "1.5 GB")
 * @returns Number of bytes, or null if invalid
 */
export function parseBytes(str: string): number | null {
  const match = str.trim().match(/^([\d.]+)\s*(bytes?|kb|mb|gb|tb|pb|eb|zb|yb)?$/i);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  
  const unit = (match[2] ?? 'bytes').toLowerCase();
  const k = 1024;
  
  const unitMap: Record<string, number> = {
    'byte': 0,
    'bytes': 0,
    'kb': 1,
    'mb': 2,
    'gb': 3,
    'tb': 4,
    'pb': 5,
    'eb': 6,
    'zb': 7,
    'yb': 8,
  };
  
  const exponent = unitMap[unit];
  if (exponent === undefined) return null;
  
  return value * (k ** exponent);
}

/**
 * Format percentage with fixed decimals
 * 
 * @param value - Percentage value (0-100)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string (e.g., "75.5%")
 */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format temperature with unit
 * 
 * @param celsius - Temperature in Celsius
 * @returns Formatted string (e.g., "45°C") or "N/A" if null
 */
export function formatTemperature(celsius: number | null): string {
  if (celsius === null || !Number.isFinite(celsius)) return 'N/A';
  return `${Math.round(celsius)}°C`;
}

/**
 * Format uptime from seconds to human readable string
 * 
 * @param seconds - Uptime in seconds
 * @returns Formatted string (e.g., "5d 12h 30m")
 */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Unknown';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  
  return parts.join(' ');
}

/**
 * Clamp a number between min and max values
 * 
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round to specific decimal places
 * 
 * @param value - Value to round
 * @param decimals - Number of decimal places
 * @returns Rounded value
 */
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
