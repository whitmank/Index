const { ipcMain, dialog, app } = require('electron');
const fs = require('fs').promises;
const chokidar = require('chokidar');
const CHANNELS = require('./channels');

// Store active file watchers
const watchers = new Map();

/**
 * Register all IPC handlers
 * @param {BrowserWindow} mainWindow - The main browser window for sending events
 */
function registerHandlers(mainWindow) {
  // File/folder picker
  ipcMain.handle(CHANNELS.SELECT_DIRECTORY, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      });
      return result.canceled ? null : result.filePaths[0];
    } catch (error) {
      console.error('Error selecting directory:', error);
      return null;
    }
  });

  ipcMain.handle(CHANNELS.SELECT_FILE, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections']
      });
      return result.canceled ? [] : result.filePaths;
    } catch (error) {
      console.error('Error selecting files:', error);
      return [];
    }
  });

  // System metadata access
  ipcMain.handle(CHANNELS.GET_FILE_METADATA, async (event, filePath) => {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        // Platform-specific attributes
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
        dev: stats.dev,
        ino: stats.ino
      };
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw error;
    }
  });

  // File system watching
  ipcMain.handle(CHANNELS.WATCH_PATH, async (event, watchPath) => {
    try {
      if (watchers.has(watchPath)) {
        console.log('Already watching:', watchPath);
        return { success: true, message: 'Already watching this path' };
      }

      console.log('Starting to watch:', watchPath);

      const watcher = chokidar.watch(watchPath, {
        persistent: true,
        ignoreInitial: true,
        ignored: /(^|[\/\\])\../, // Ignore dotfiles
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100
        }
      });

      watcher
        .on('add', path => {
          console.log(`File added: ${path}`);
          mainWindow.webContents.send(CHANNELS.FILE_CHANGED, {
            type: 'add',
            path
          });
        })
        .on('change', path => {
          console.log(`File changed: ${path}`);
          mainWindow.webContents.send(CHANNELS.FILE_CHANGED, {
            type: 'change',
            path
          });
        })
        .on('unlink', path => {
          console.log(`File removed: ${path}`);
          mainWindow.webContents.send(CHANNELS.FILE_CHANGED, {
            type: 'unlink',
            path
          });
        })
        .on('addDir', path => {
          console.log(`Directory added: ${path}`);
          mainWindow.webContents.send(CHANNELS.DIRECTORY_CHANGED, {
            type: 'add',
            path
          });
        })
        .on('unlinkDir', path => {
          console.log(`Directory removed: ${path}`);
          mainWindow.webContents.send(CHANNELS.DIRECTORY_CHANGED, {
            type: 'unlink',
            path
          });
        })
        .on('error', error => {
          console.error(`Watcher error for ${watchPath}:`, error);
        });

      watchers.set(watchPath, watcher);

      return { success: true, message: `Watching ${watchPath}` };
    } catch (error) {
      console.error('Error watching path:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(CHANNELS.UNWATCH_PATH, async (event, watchPath) => {
    try {
      const watcher = watchers.get(watchPath);
      if (watcher) {
        await watcher.close();
        watchers.delete(watchPath);
        console.log('Stopped watching:', watchPath);
        return { success: true, message: `Stopped watching ${watchPath}` };
      }
      return { success: true, message: 'Path was not being watched' };
    } catch (error) {
      console.error('Error unwatching path:', error);
      return { success: false, error: error.message };
    }
  });

  // App path handlers
  ipcMain.handle(CHANNELS.GET_APP_PATH, async () => {
    return app.getAppPath();
  });

  ipcMain.handle(CHANNELS.GET_USER_DATA_PATH, async () => {
    return app.getPath('userData');
  });

  console.log('✅ IPC handlers registered');
}

/**
 * Clean up all watchers (call on app quit)
 */
async function cleanup() {
  console.log('🧹 Cleaning up file watchers...');
  for (const [path, watcher] of watchers) {
    try {
      await watcher.close();
      console.log(`Closed watcher for: ${path}`);
    } catch (error) {
      console.error(`Error closing watcher for ${path}:`, error);
    }
  }
  watchers.clear();
}

module.exports = { registerHandlers, cleanup };
