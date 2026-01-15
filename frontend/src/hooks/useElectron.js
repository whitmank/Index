/**
 * React hook for accessing Electron APIs
 * Provides a clean interface to Electron functionality while maintaining web compatibility
 */
export function useElectron() {
  // Check if running in Electron environment
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

  // Return object with Electron API methods
  // Methods return null when not in Electron to allow graceful fallback
  return {
    // Environment check
    isElectron,

    // File system operations
    selectDirectory: isElectron ? window.electronAPI.selectDirectory : null,
    selectFile: isElectron ? window.electronAPI.selectFile : null,
    getFileMetadata: isElectron ? window.electronAPI.getFileMetadata : null,

    // File watching
    watchPath: isElectron ? window.electronAPI.watchPath : null,
    unwatchPath: isElectron ? window.electronAPI.unwatchPath : null,
    onFileChanged: isElectron ? window.electronAPI.onFileChanged : null,
    onDirectoryChanged: isElectron ? window.electronAPI.onDirectoryChanged : null,

    // App paths
    getAppPath: isElectron ? window.electronAPI.getAppPath : null,
    getUserDataPath: isElectron ? window.electronAPI.getUserDataPath : null
  };
}
