// Author: Claude Sonnet 4.6
// IPC handler for file system operations.
// Exposes fs:readFolder — reads a directory tree recursively for the import modal.
// Exposes fs:thumbnail — returns a base64 data URL thumbnail for local image files.

import { ipcMain, nativeImage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Recursively reads a directory and returns a tree structure.
 * Skips hidden entries (names starting with ".").
 * Dirs sort before files; each group sorted alphabetically.
 */
export async function readFolderTree(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const children = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const subtree = await readFolderTree(fullPath);
      children.push(subtree);
    } else if (entry.isFile()) {
      children.push({ name: entry.name, path: fullPath, type: 'file' });
    }
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return { name: path.basename(dirPath), path: dirPath, type: 'dir', children };
}

export function registerFsHandlers() {
  ipcMain.handle('fs:thumbnail', async (_event, filePath, size = 40) => {
    // Try createThumbnailFromPath first — uses system cache, fast
    try {
      const img = await nativeImage.createThumbnailFromPath(filePath, { width: size, height: size });
      if (!img.isEmpty()) {
        const buf = img.toPNG();
        if (buf.length > 0) return `data:image/png;base64,${buf.toString('base64')}`;
      }
    } catch {
      // fall through
    }

    // Fallback: load full image via NSImage (supports TIFF, HEIC, etc.) and resize
    try {
      const full = nativeImage.createFromPath(filePath);
      if (full.isEmpty()) return null;
      const resized = full.resize({ width: size, height: size });
      const buf = resized.toPNG();
      if (buf.length === 0) return null;
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch (err) {
      console.error('[fs:thumbnail]', filePath, err.message);
      return null;
    }
  });

  ipcMain.handle('fs:readFolder', async (_event, folderPath) => {
    try {
      const stat = await fs.stat(folderPath);
      if (stat.isDirectory()) {
        const tree = await readFolderTree(folderPath);
        return { success: true, data: tree };
      } else {
        return {
          success: true,
          data: {
            name: path.basename(folderPath),
            path: folderPath,
            type: 'file',
            children: [],
          },
        };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
