const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');
const { registerHandlers, cleanup: cleanupIpc } = require('./ipc/handlers');
const databaseManager = require('./services/database-manager');
const pathResolver = require('./services/path-resolver');

// Parse --db argument (format: --db dev/test or --db user/0)
// Checks both process.argv and ELECTRON_ARGS env variable
function parseDbArg() {
  // First check process.argv
  let args = process.argv.slice(2);

  // Also check ELECTRON_ARGS env variable (set by electron-dev.js script)
  if (process.env.ELECTRON_ARGS) {
    try {
      const envArgs = JSON.parse(process.env.ELECTRON_ARGS);
      args = [...args, ...envArgs];
    } catch (e) {
      // Ignore parse errors
    }
  }

  const dbIndex = args.findIndex(arg => arg === '--db');
  if (dbIndex !== -1 && args[dbIndex + 1]) {
    const dbArg = args[dbIndex + 1];
    const [namespace, database] = dbArg.split('/');
    if (namespace && database) {
      return { namespace, database };
    }
  }
  return { namespace: 'dev', database: 'test' }; // Default
}

const dbConfig = parseDbArg();
console.log(`🗄️  Database config: ${dbConfig.namespace}/${dbConfig.database}`);

// Set app name for macOS menu bar (must be before app ready)
if (process.platform === 'darwin') {
  app.setName('Index');
}

// Auto-reload on main process changes (development only)
try {
  if (!app.isPackaged) {
    require('electron-reloader')(module, {
      debug: true,
      watchRenderer: false, // Vite handles renderer reloading
      ignore: [
        'node_modules',
        'data',
        'frontend/dist',
        'dist-electron'
      ]
    });
    console.log('🔄 Electron auto-reload enabled for main process changes');
  }
} catch (err) {
  // electron-reloader not available in production
}

let mainWindow = null;
let serverConfig = null;

/**
 * Create the main browser window
 */
async function createMainWindow() {
  const windowTitle = `Index — ${dbConfig.namespace}/${dbConfig.database}`;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: windowTitle,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Required for preload script to work
    },
    // Standard macOS title bar with traffic lights
    titleBarStyle: 'default',
    backgroundColor: '#1a1a1a'
  });

  // Prevent HTML title from overriding window title (must be before load)
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  // Load the app
  if (pathResolver.isDev) {
    // Development: Load from Vite dev server
    console.log('📱 Loading from Vite dev server: http://localhost:5173');
    await mainWindow.loadURL('http://localhost:5173');

    // Enable keyboard shortcuts for development
    const { globalShortcut } = require('electron');

    // Cmd/Ctrl+R: Reload (standard browser shortcut)
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if ((input.meta || input.control) && input.key === 'r') {
        mainWindow.webContents.reload();
        event.preventDefault();
      }
    });

    console.log('⌨️  Dev shortcuts: Cmd/Ctrl+R to reload, Cmd/Ctrl+Shift+I for DevTools');
  } else {
    // Production: Load built files
    const frontendPath = pathResolver.getFrontendPath();
    console.log('📱 Loading from built files:', frontendPath);
    await mainWindow.loadFile(path.join(frontendPath, 'index.html'));
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Initialize the application
 */
async function initializeApp() {
  try {
    console.log('\n🚀 Initializing Index application...');
    console.log(`📦 Mode: ${pathResolver.isDev ? 'Development' : 'Production'}`);
    console.log(`💻 Platform: ${pathResolver.platform}\n`);

    // Start backend services first
    serverConfig = await databaseManager.startServices(dbConfig);

    // Wait a moment for services to be fully ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create main window
    mainWindow = await createMainWindow();

    // Register IPC handlers after window is created
    registerHandlers(mainWindow);

    // Set custom menu for macOS to show correct app name
    if (process.platform === 'darwin') {
      const template = [
        {
          label: 'Index',
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' }
          ]
        },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
          ]
        },
        {
          label: 'Window',
          submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' }
          ]
        }
      ];
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }

    console.log('\n✅ Application initialized successfully');
    console.log(`🌐 API running on: http://localhost:${serverConfig.PORT}`);
    console.log(`📊 Database running on: http://localhost:${serverConfig.DB_PORT}\n`);

  } catch (error) {
    console.error('\n❌ Failed to initialize application:', error);

    // Show error dialog to user
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start Index application:\n\n${error.message}\n\nPlease check the console for more details.`
    );

    // Quit the app
    app.quit();
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('\n🛑 Shutting down application...');

  try {
    // Clean up IPC handlers and file watchers
    await cleanupIpc();

    // Stop backend services
    await databaseManager.stopServices();

    console.log('✅ Application shut down cleanly\n');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
}

// ============================================
// App Lifecycle Events
// ============================================

// This method will be called when Electron has finished
// initialization and is ready to create browser windows
app.whenReady().then(initializeApp);

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  // On macOS, apps typically stay open until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, re-create window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    initializeApp();
  }
});

// Clean up before quitting
app.on('before-quit', async (event) => {
  if (databaseManager.isRunning()) {
    event.preventDefault(); // Prevent immediate quit
    await shutdown();
    app.exit(0); // Now actually quit
  }
});

// Handle unhandled errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred:\n\n${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

console.log('🎯 Electron main process started');
