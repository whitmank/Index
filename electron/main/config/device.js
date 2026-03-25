import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';

// Author: Claude Code
// Device identification system - manages device ID and naming across app instances

const DEVICE_ID_FILE = path.join(os.homedir(), '.index', '.device-id');

let _deviceCache = null;

/**
 * Initialize or load device identity
 * On first run: creates new device ID, name is null (user must provide via dialog)
 * On subsequent runs: loads existing device ID and updates last_seen
 * @returns {Promise<{id: string, name: string|null, created_at: string, last_seen: string}>}
 */
export async function initializeDeviceId() {
  if (_deviceCache) return _deviceCache;

  if (fs.existsSync(DEVICE_ID_FILE)) {
    // Load existing device
    const device = JSON.parse(fs.readFileSync(DEVICE_ID_FILE, 'utf-8'));

    // Update last_seen timestamp
    device.last_seen = new Date().toISOString();
    fs.writeFileSync(DEVICE_ID_FILE, JSON.stringify(device, null, 2));

    console.log(`[Device] Loaded device: ${device.name || '(unnamed)'} (${device.id})`);
    _deviceCache = device;
    return device;
  }

  // New device: generate ID, name will be set later via dialog
  const newDevice = {
    id: uuid(),
    name: null,
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString()
  };

  // Ensure .index/ directory exists
  const indexDir = path.dirname(DEVICE_ID_FILE);
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }

  fs.writeFileSync(DEVICE_ID_FILE, JSON.stringify(newDevice, null, 2));
  console.log(`[Device] Created new device: ${newDevice.id}`);
  _deviceCache = newDevice;
  return newDevice;
}

/**
 * Get current device's origin identifier (user-friendly name)
 * Returns null if device exists but hasn't been named yet
 * @returns {Promise<string|null>}
 */
export async function getDeviceOrigin() {
  const device = await initializeDeviceId();
  return device.name;
}

/**
 * Check if device has been named
 * @returns {Promise<boolean>}
 */
export async function isDeviceNamed() {
  const device = await initializeDeviceId();
  return device.name !== null && device.name !== '';
}

/**
 * Set device name (called after user provides name via dialog)
 * @param {string} name - User-friendly device name (e.g., "My Laptop", "iPad")
 * @returns {Promise<{id: string, name: string, created_at: string, last_seen: string}>}
 * @throws {Error} if name is empty
 */
export async function setDeviceName(name) {
  if (!name || name.trim() === '') {
    throw new Error('Device name cannot be empty');
  }

  const device = await initializeDeviceId();
  device.name = name.trim();
  device.last_seen = new Date().toISOString();

  fs.writeFileSync(DEVICE_ID_FILE, JSON.stringify(device, null, 2));
  console.log(`[Device] Device named: ${device.name}`);
  _deviceCache = device;
  return device;
}

/**
 * Get device ID (internal UUID)
 * @returns {Promise<string>}
 */
export async function getDeviceId() {
  const device = await initializeDeviceId();
  return device.id;
}
