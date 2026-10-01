// Author: Claude Sonnet 4.6
// IPC handler for file system operations.
// Exposes fs:readFolder — reads a directory tree recursively for the import modal.
// Exposes fs:thumbnail — returns a base64 data URL thumbnail for local image files.
// Exposes fs:epubCover — extracts epub cover via macOS qlmanage QuickLook.

import { ipcMain, nativeImage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import crypto from 'crypto';

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

  ipcMain.handle('fs:readFile', async (_event, filePath) => {
    const buffer = await fs.readFile(filePath);
    return buffer;
  });

  // ── EPUB cover ──────────────────────────────────────────────────────────────
  // Uses macOS qlmanage to generate a cover thumbnail via the system QuickLook
  // epub plugin (provided by Books.app). Result cached in a per-file tmp dir.

  ipcMain.handle('fs:epubCover', async (_event, filePath, size = 200) => {
    try {
      // Stable tmp dir keyed by file path so we cache across calls
      const hash    = crypto.createHash('md5').update(filePath).digest('hex').slice(0, 12);
      const tmpDir  = path.join('/tmp', `index-epub-${hash}`);
      await fs.mkdir(tmpDir, { recursive: true });

      // Check for a cached result first
      const entries = await fs.readdir(tmpDir);
      const cached  = entries.find(e => e.endsWith('.png'));
      if (cached) {
        const buf = await fs.readFile(path.join(tmpDir, cached));
        return `data:image/png;base64,${buf.toString('base64')}`;
      }

      // Generate via qlmanage
      await new Promise((resolve, reject) => {
        execFile(
          'qlmanage',
          ['-t', '-s', String(size), '-o', tmpDir, filePath],
          { timeout: 8000, stdio: 'pipe' },
          (err) => (err ? reject(err) : resolve()),
        );
      });

      // qlmanage writes {basename}.png (e.g. book.epub.png)
      const generated = (await fs.readdir(tmpDir)).find(e => e.endsWith('.png'));
      if (!generated) return null;

      const buf = await fs.readFile(path.join(tmpDir, generated));
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch (err) {
      console.error('[fs:epubCover]', filePath, err.message);
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
