import { dialog } from 'electron';
import { isDeviceNamed, setDeviceName } from '../config/device.js';

// Author: Claude Code
// Device naming dialog - prompts user to name device on first run

/**
 * Show device naming dialog if needed
 * On first run: shows welcome + input dialog for device name
 * On subsequent runs: returns true immediately (device already named)
 * @returns {Promise<boolean>} true if device is ready to use, false if user cancelled
 */
export async function ensureDeviceNamed() {
  const named = await isDeviceNamed();

  if (named) {
    // Device already named, proceed without dialog
    return true;
  }

  // Device exists but not yet named - show dialog
  console.log('[Device Dialog] Showing device naming dialog');

  // Show welcome message
  const welcomeResult = await dialog.showMessageBox(null, {
    type: 'question',
    title: 'Welcome to Index',
    message: 'What is the name of this device?',
    detail: 'This helps Index identify where your files are located when syncing across devices (e.g., "My Laptop", "iPad", "Work Desktop").',
    buttons: ['Continue', 'Quit'],
    defaultId: 0,
    cancelId: 1
  });

  if (welcomeResult.response === 1) {
    // User clicked Quit
    console.log('[Device Dialog] User cancelled device naming');
    return false;
  }

  // Show input dialog for device name
  let deviceName = '';
  let cancelled = false;

  try {
    const inputResult = await dialog.showInputDialog({
      title: 'Device Name',
      label: 'Device name:',
      defaultValue: '',
      type: 'question'
    });

    deviceName = inputResult.value;
    cancelled = inputResult.cancelled;
  } catch (error) {
    // Fallback for older Electron versions that don't support showInputDialog
    console.log('[Device Dialog] showInputDialog not available, using showMessageBox');

    const inputResult = await dialog.showMessageBox(null, {
      type: 'question',
      title: 'Device Name',
      message: 'Enter a name for this device:',
      buttons: ['OK', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    });

    if (inputResult.response === 1) {
      cancelled = true;
    }
  }

  if (cancelled || !deviceName?.trim()) {
    // User cancelled or didn't enter name
    console.log('[Device Dialog] User cancelled or entered empty name');
    return false;
  }

  // Save device name
  try {
    await setDeviceName(deviceName);
    console.log(`[Device Dialog] Device named successfully: ${deviceName}`);
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
