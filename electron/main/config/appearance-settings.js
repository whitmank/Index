// Author: Claude Sonnet 4.6
// Persists appearance settings to ~/.index/appearance.json

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const INDEX_DIR = path.join(app.getPath('home'), '.index');
const SETTINGS_PATH = path.join(INDEX_DIR, 'appearance.json');

export function loadAppearanceSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('[AppearanceSettings] Failed to load, using defaults:', e.message);
  }
  return null;
}

export function saveAppearanceSettings(values) {
  try {
    if (!fs.existsSync(INDEX_DIR)) fs.mkdirSync(INDEX_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(values, null, 2));
  } catch (e) {
    console.warn('[AppearanceSettings] Failed to save:', e.message);
  }
}
