// Author: Claude Sonnet 4.6
// Manages appearance settings: background tint (HSLA).
// Persists to ~/.index/appearance.json via main process IPC (reliable cross-launch),
// with localStorage as an in-session fallback.

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'index:appearance';

const DEFAULTS = {
  bgH: 0,
  bgS: 0,
  bgL: 92,
  bgA: 0.75,
};

function normalize(parsed) {
  const values = { ...DEFAULTS, ...parsed };
  // Guard: bgA of 0 makes the app invisible.
  if (values.bgA <= 0) values.bgA = DEFAULTS.bgA;
  return values;
}

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULTS };
    const parsed = JSON.parse(saved);
    // Migrate legacy bgLightness/bgOpacity keys
    if ('bgLightness' in parsed || 'bgOpacity' in parsed) {
      return normalize({
        bgL: parsed.bgLightness != null ? Math.round(parsed.bgLightness / 255 * 100) : DEFAULTS.bgL,
        bgA: parsed.bgOpacity ?? DEFAULTS.bgA,
      });
    }
    return normalize(parsed);
  } catch {
    return { ...DEFAULTS };
  }
}

function save(values) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  window.electronAPI?.appearance?.set?.(values);
}

function applyToDOM({ bgH, bgS, bgL, bgA }) {
  const root = document.documentElement;
  root.style.setProperty('--app-bg-h', bgH);
  root.style.setProperty('--app-bg-s', `${bgS}%`);
  root.style.setProperty('--app-bg-l', `${bgL}%`);
  root.style.setProperty('--app-bg-a', bgA);
}

export function useAppearance() {
  const [values, setValues] = useState(() => {
    const loaded = loadFromStorage();
    applyToDOM(loaded);
    return loaded;
  });

  const update = useCallback((key, value) => {
    setValues(prev => {
      const next = { ...prev, [key]: value };
      save(next);
      applyToDOM(next);
      return next;
    });
  }, []);

  return { values, update };
}

// Called in main.jsx before React renders. Loads from file via IPC (reliable),
// falls back to localStorage. Returns a promise so main.jsx can await it.
export async function initAppearance() {
  let values;
  try {
    const fromFile = await window.electronAPI?.appearance?.get?.();
    values = fromFile ? normalize(fromFile) : loadFromStorage();
  } catch {
    values = loadFromStorage();
  }
  applyToDOM(values);
  // Sync localStorage with the authoritative file value
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}
