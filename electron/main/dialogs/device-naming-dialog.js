import { dialog, BrowserWindow, ipcMain } from 'electron';
import { isDeviceNamed, setDeviceName } from '../config/device.js';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Author: Claude Code
// Device naming dialog - prompts user to name device on first run

let deviceNameResult = null;

/**
 * Check if a device name is already in use by existing objects
 * @param {string} name Device name to check
 * @returns {Promise<boolean>} true if name is already in use
 */
async function isDeviceNameInUse(name) {
  try {
    const objectsDir = join(homedir(), '.index', 'objects');
    const files = await readdir(objectsDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = await readFile(join(objectsDir, file), 'utf-8');
        const obj = JSON.parse(content);

        // Check if any source has this origin
        if (obj.sources && Array.isArray(obj.sources)) {
          const hasOrigin = obj.sources.some(source => source.origin === name);
          if (hasOrigin) {
            return true;
          }
        }
      } catch (err) {
        // Skip files that can't be parsed
        console.warn(`[Device Dialog] Could not parse object file ${file}:`, err.message);
      }
    }

    return false;
  } catch (err) {
    // If objects directory doesn't exist yet, name is not in use
    if (err.code === 'ENOENT') {
      return false;
    }
    console.error('[Device Dialog] Error checking device name:', err);
    return false;
  }
}

/**
 * Show device naming dialog if needed
 * On first run: shows simple input prompt for device name
 * On subsequent runs: returns true immediately (device already named)
 * @returns {Promise<boolean>} true if device is ready to use, false if user cancelled
 */
export async function ensureDeviceNamed() {
  const named = await isDeviceNamed();

  if (named) {
    // Device already named, proceed without dialog
    return true;
  }

  console.log('[Device Dialog] Showing device naming dialog');

  const deviceName = await showDeviceNamePrompt();

  if (!deviceName || !deviceName.trim()) {
    console.log('[Device Dialog] User cancelled or entered empty name');
    return false;
  }

  const trimmedName = deviceName.trim();

  // Check for invalid names
  if (trimmedName.length > 50) {
    await dialog.showErrorBox(
      'Invalid Name',
      'Device name must be 50 characters or less.'
    );
    return ensureDeviceNamed(); // Retry
  }

  // Check if device name is already in use
  const nameInUse = await isDeviceNameInUse(trimmedName);
  if (nameInUse) {
    await dialog.showErrorBox(
      'Name Already Used',
      `The device name "${trimmedName}" is already in use by another device. Please choose a different name.`
    );
    return ensureDeviceNamed(); // Retry
  }

  // Save device name
  try {
    await setDeviceName(trimmedName);
    console.log(`[Device Dialog] Device named successfully: ${trimmedName}`);
    return true;
  } catch (error) {
    console.error('[Device Dialog] Failed to set device name:', error);

    await dialog.showErrorBox(
      'Error',
      `Failed to save device name: ${error.message}`
    );

    return false;
  }
}

/**
 * Show simple input prompt for device name
 * @returns {Promise<string|null>} Device name or null if cancelled
 */
function showDeviceNamePrompt() {
  return new Promise((resolve) => {
    deviceNameResult = null;

    // Register IPC handler for this dialog
    const handler = (event, value) => {
      deviceNameResult = value;
      ipcMain.removeListener('device:submit-name', handler);
    };

    ipcMain.on('device:submit-name', handler);

    // Create window
    const inputWindow = new BrowserWindow({
      width: 450,
      height: 200,
      resizable: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'device-naming-preload.js'),
      }
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #f5f5f5;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 20px rgba(0,0,0,0.15);
            width: 90%;
            max-width: 400px;
          }
          label {
            display: block;
            margin-bottom: 15px;
            font-weight: 500;
            color: #333;
            font-size: 15px;
          }
          input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ccc;
            border-radius: 6px;
            font-size: 14px;
            margin-bottom: 20px;
            font-family: inherit;
          }
          input:focus {
            outline: none;
            border-color: #007AFF;
            box-shadow: 0 0 0 3px rgba(0,122,255,0.1);
          }
          .buttons {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
          }
          button {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          }
          .cancel {
            background: #e8e8e8;
            color: #333;
          }
          .cancel:hover {
            background: #d8d8d8;
          }
          .save {
            background: #007AFF;
            color: white;
          }
          .save:hover {
            background: #0051D5;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <label for="deviceName">Enter a name for this device:</label>
          <input type="text" id="deviceName" placeholder="e.g., My Laptop, iPad, Desktop">
          <div class="buttons">
            <button class="cancel">Cancel</button>
            <button class="save">Save</button>
          </div>
        </div>
        <script>
          const input = document.getElementById('deviceName');
          const [cancelBtn, saveBtn] = document.querySelectorAll('button');

          function save() {
            const value = input.value.trim() || null;
            window.dialogAPI.submitName(value);
            window.close();
          }

          function cancel() {
            window.dialogAPI.submitName(null);
            window.close();
          }

          saveBtn.addEventListener('click', save);
          cancelBtn.addEventListener('click', cancel);
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') save();
          });

          input.focus();
        </script>
      </body>
      </html>
    `;

    inputWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    inputWindow.show();

    // Wait for response
    const checkInterval = setInterval(() => {
      if (deviceNameResult !== null) {
        clearInterval(checkInterval);
        inputWindow.destroy();
        ipcMain.removeListener('device:submit-name', handler);
        resolve(deviceNameResult);
      }
    }, 50);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!inputWindow.isDestroyed()) {
        inputWindow.destroy();
      }
      ipcMain.removeListener('device:submit-name', handler);
      resolve(null);
    }, 300000);
  });
}
