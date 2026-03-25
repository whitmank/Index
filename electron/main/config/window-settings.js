// Author: Claude Code (Anthropic)
// Persists window behavior profile to ~/.index/window-settings.json

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const INDEX_DIR = path.join(app.getPath('home'), '.index');
const SETTINGS_PATH = path.join(INDEX_DIR, 'window-settings.json');

const DEFAULTS = {
  profile: 'overlay', // 'overlay' | 'window'
};

export function loadWindowSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      return { ...DEFAULTS, ...data };
    }
  } catch (e) {
    console.warn('[WindowSettings] Failed to load, using defaults:', e.message);
  }
  return { ...DEFAULTS };
}

export function saveWindowSettings(updates) {
  if (!fs.existsSync(INDEX_DIR)) {
    fs.mkdirSync(INDEX_DIR, { recursive: true });
  }
  const current = loadWindowSettings();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ ...current, ...updates }, null, 2));
}
