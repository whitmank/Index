import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface SourceMetadata {
  name: string;
  mime_type?: string;
  size?: number;
  extension?: string;
  [key: string]: unknown;
}

export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface WatchEvent {
  uri: string;
  event: 'change' | 'delete';
  timestamp: string;
}

export interface HandlerInfo {
  scheme: string;
  capabilities: {
    canWatch: boolean;
    canOpen: boolean;
    canPreview: boolean;
    canCache: boolean;
  };
}

export interface ElectronAPI {
  // File operations (future phase)
  selectDirectory: () => Promise<string | null>;
  selectFiles: () => Promise<string[] | null>;
  selectPaths: (options: { multiple?: boolean; isDir?: boolean }) => Promise<string[] | null>;

  // Source operations
  extractMetadata: (uri: string) => Promise<IpcResponse<SourceMetadata>>;
  openSource: (uri: string) => Promise<IpcResponse<void>>;
  getContentHash: (uri: string) => Promise<IpcResponse<string>>;

  // Source watching
  watchSource: (uri: string, callback: (event: WatchEvent) => void) => void;
  stopWatching: (uri: string) => void;
  onWatchEvent: (callback: (event: WatchEvent) => void) => () => void;
  onWatchError: (callback: (data: { uri: string; error: string }) => void) => () => void;

  // Registry operations
  getRegistryInfo: () => Promise<IpcResponse<{ schemes: string[]; handlers: HandlerInfo[] }>>;
  canHandle: (uri: string) => Promise<IpcResponse<boolean>>;
}

const electronAPI: ElectronAPI = {
  selectDirectory: () => ipcRenderer.invoke('fs:select-directory'),
  selectFiles: () => ipcRenderer.invoke('fs:select-files'),
  selectPaths: (options) => ipcRenderer.invoke('fs:select-paths', options),

  extractMetadata: (uri: string) => ipcRenderer.invoke('source:extract-metadata', uri),
  openSource: (uri: string) => ipcRenderer.invoke('source:open', uri),
  getContentHash: (uri: string) => ipcRenderer.invoke('source:get-hash', uri),

  watchSource: (uri: string, callback: (event: WatchEvent) => void) => {
    // Listen for watch events from this URI
    ipcRenderer.on('source:watch-event', (event: IpcRendererEvent, data: WatchEvent) => {
      if (data.uri === uri) {
        callback(data);
      }
    });

    // Start watching
    ipcRenderer.send('source:watch-start', uri);
  },

  stopWatching: (uri: string) => {
    ipcRenderer.send('source:watch-stop', uri);
  },

  onWatchEvent: (callback: (event: WatchEvent) => void) => {
    const listener = (event: IpcRendererEvent, data: WatchEvent) => {
      callback(data);
    };
    ipcRenderer.on('source:watch-event', listener);
    return () => ipcRenderer.removeListener('source:watch-event', listener);
  },

  onWatchError: (callback: (data: { uri: string; error: string }) => void) => {
    const listener = (event: IpcRendererEvent, data: { uri: string; error: string }) => {
      callback(data);
    };
    ipcRenderer.on('source:watch-error', listener);
    return () => ipcRenderer.removeListener('source:watch-error', listener);
  },

  getRegistryInfo: () => ipcRenderer.invoke('registry:get-info'),
  canHandle: (uri: string) => ipcRenderer.invoke('registry:can-handle', uri),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
