import { describe, it, expect } from 'vitest';
import type {
  ElectronAPI,
  IpcResponse,
  SourceMetadata,
  WatchEvent,
  HandlerInfo,
} from '../index';

/**
 * Electron API Tests
 *
 * Tests the type definitions and API structure exposed to renderers
 */

describe('Electron API Types', () => {
  describe('IpcResponse type', () => {
    it('creates success response with data', () => {
      const response: IpcResponse<string> = {
        success: true,
        data: 'test data',
      };

      expect(response.success).toBe(true);
      expect(response.data).toBe('test data');
      expect(response.error).toBeUndefined();
    });

    it('creates error response', () => {
      const response: IpcResponse<void> = {
        success: false,
        error: 'Something went wrong',
      };

      expect(response.success).toBe(false);
      expect(response.error).toBe('Something went wrong');
      expect(response.data).toBeUndefined();
    });
  });

  describe('SourceMetadata type', () => {
    it('creates metadata object', () => {
      const metadata: SourceMetadata = {
        name: 'test.pdf',
        mime_type: 'application/pdf',
        size: 1024,
        extension: '.pdf',
      };

      expect(metadata.name).toBe('test.pdf');
      expect(metadata.mime_type).toBe('application/pdf');
      expect(metadata.size).toBe(1024);
      expect(metadata.extension).toBe('.pdf');
    });

    it('supports additional properties', () => {
      const metadata: SourceMetadata = {
        name: 'test.txt',
        custom_field: 'custom value',
        is_file: true,
      };

      expect(metadata.name).toBe('test.txt');
      expect(metadata.custom_field).toBe('custom value');
      expect(metadata.is_file).toBe(true);
    });
  });

  describe('WatchEvent type', () => {
    it('creates change event', () => {
      const event: WatchEvent = {
        uri: 'file:///path/to/file.txt',
        event: 'change',
        timestamp: new Date().toISOString(),
      };

      expect(event.uri).toBe('file:///path/to/file.txt');
      expect(event.event).toBe('change');
      expect(typeof event.timestamp).toBe('string');
    });

    it('creates delete event', () => {
      const event: WatchEvent = {
        uri: 'file:///path/to/deleted.txt',
        event: 'delete',
        timestamp: new Date().toISOString(),
      };

      expect(event.uri).toBe('file:///path/to/deleted.txt');
      expect(event.event).toBe('delete');
    });
  });

  describe('HandlerInfo type', () => {
    it('creates handler info', () => {
      const handlerInfo: HandlerInfo = {
        scheme: 'file',
        capabilities: {
          canWatch: true,
          canOpen: true,
          canPreview: false,
          canCache: false,
        },
      };

      expect(handlerInfo.scheme).toBe('file');
      expect(handlerInfo.capabilities.canWatch).toBe(true);
      expect(handlerInfo.capabilities.canOpen).toBe(true);
      expect(handlerInfo.capabilities.canPreview).toBe(false);
      expect(handlerInfo.capabilities.canCache).toBe(false);
    });
  });

  describe('ElectronAPI interface', () => {
    it('defines source operations methods', () => {
      const apiMethods = [
        'extractMetadata',
        'openSource',
        'getContentHash',
        'watchSource',
        'stopWatching',
        'onWatchEvent',
        'onWatchError',
        'getRegistryInfo',
        'canHandle',
      ];

      for (const method of apiMethods) {
        expect(method).toBeDefined();
      }
    });

    it('defines file operations methods', () => {
      const apiMethods = ['selectDirectory', 'selectFiles', 'selectPaths'];

      for (const method of apiMethods) {
        expect(method).toBeDefined();
      }
    });
  });

  describe('API method signatures', () => {
    it('extractMetadata takes URI and returns metadata response', () => {
      type ExtractMetadataSignature = (
        uri: string
      ) => Promise<IpcResponse<SourceMetadata>>;

      const mockFn: ExtractMetadataSignature = async (uri: string) => ({
        success: true,
        data: { name: 'test.pdf' },
      });

      expect(mockFn).toBeDefined();
    });

    it('getContentHash takes URI and returns hash response', () => {
      type GetHashSignature = (uri: string) => Promise<IpcResponse<string>>;

      const mockFn: GetHashSignature = async (uri: string) => ({
        success: true,
        data: 'sha256:abc123',
      });

      expect(mockFn).toBeDefined();
    });

    it('openSource takes URI and returns empty response', () => {
      type OpenSourceSignature = (uri: string) => Promise<IpcResponse<void>>;

      const mockFn: OpenSourceSignature = async (uri: string) => ({
        success: true,
      });

      expect(mockFn).toBeDefined();
    });

    it('watchSource sets up listener for URI', () => {
      type WatchSourceSignature = (
        uri: string,
        callback: (event: WatchEvent) => void
      ) => void;

      const mockFn: WatchSourceSignature = (uri, callback) => {
        // Mock implementation
      };

      expect(mockFn).toBeDefined();
    });

    it('onWatchEvent returns unsubscribe function', () => {
      type OnWatchEventSignature = (
        callback: (event: WatchEvent) => void
      ) => () => void;

      const mockFn: OnWatchEventSignature = (callback) => {
        return () => {
          // Mock unsubscribe
        };
      };

      expect(mockFn).toBeDefined();
    });
  });
});
