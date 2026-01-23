import { describe, it, expect, beforeEach } from 'vitest';
import { SourceHandler, SourceCapabilities, ExtractedMetadata } from '../src/handler-base';
import { HandlerRegistry } from '../src/handler-registry';

/**
 * Mock handler for testing
 */
class MockHandler extends SourceHandler {
  scheme = 'mock';

  capabilities: SourceCapabilities = {
    canWatch: false,
    canOpen: false,
    canPreview: false,
    canCache: false,
  };

  canHandle(uri: string): boolean {
    return uri.startsWith('mock://');
  }

  validate(uri: string): void {
    if (!uri.startsWith('mock://')) {
      throw new Error('Invalid mock URI');
    }
  }

  async extractMetadata(uri: string): Promise<ExtractedMetadata> {
    return { name: 'mock-file' };
  }

  async getContentHash(uri: string): Promise<string> {
    return 'sha256:mock123';
  }

  async getContent(uri: string): Promise<Buffer | string> {
    return 'mock content';
  }
}

/**
 * Mock handler with watch capability
 */
class MockWatchableHandler extends MockHandler {
  capabilities: SourceCapabilities = {
    canWatch: true,
    canOpen: false,
    canPreview: false,
    canCache: false,
  };

  watch(uri: string, callback: (event: 'change' | 'delete', uri: string) => void) {
    return {
      close: () => {
        // mock
      },
    };
  }
}

describe('HandlerRegistry', () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    registry = new HandlerRegistry();
  });

  describe('register and unregister', () => {
    it('registers a handler', () => {
      const handler = new MockHandler();
      registry.register(handler);

      expect(registry.getSchemes()).toContain('mock');
    });

    it('unregisters a handler', () => {
      const handler = new MockHandler();
      registry.register(handler);
      registry.unregister('mock');

      expect(registry.getSchemes()).not.toContain('mock');
    });

    it('handles scheme case insensitively', () => {
      const handler = new MockHandler();
      registry.register(handler);

      expect(registry.getSchemes()).toContain('mock');

      // Should find handler regardless of case
      const found = registry.canHandle('MOCK://test');
      expect(found).toBe(true);
    });

    it('overwrites existing handler with warning', () => {
      const handler1 = new MockHandler();
      const handler2 = new MockHandler();

      registry.register(handler1);
      registry.register(handler2);

      expect(registry.getSchemes()).toContain('mock');
    });
  });

  describe('findHandler', () => {
    it('finds handler by URI scheme', () => {
      const handler = new MockHandler();
      registry.register(handler);

      const found = registry.findHandler('mock://test/path');
      expect(found).toBe(handler);
    });

    it('throws when no handler found', () => {
      expect(() => {
        registry.findHandler('unknown://test');
      }).toThrow('No handler registered for scheme: unknown');
    });

    it('throws for invalid URI format', () => {
      expect(() => {
        registry.findHandler('not a valid uri');
      }).toThrow('Invalid URI format');
    });

    it('handles mixed case schemes', () => {
      const handler = new MockHandler();
      registry.register(handler);

      const found = registry.findHandler('MOCK://test');
      expect(found).toBe(handler);
    });
  });

  describe('canHandle', () => {
    it('returns true when handler exists', () => {
      const handler = new MockHandler();
      registry.register(handler);

      expect(registry.canHandle('mock://test')).toBe(true);
    });

    it('returns false when no handler exists', () => {
      expect(registry.canHandle('unknown://test')).toBe(false);
    });

    it('returns false for invalid URIs', () => {
      expect(registry.canHandle('not a uri')).toBe(false);
    });
  });

  describe('extractMetadata', () => {
    it('delegates to appropriate handler', async () => {
      const handler = new MockHandler();
      registry.register(handler);

      const metadata = await registry.extractMetadata('mock://test');
      expect(metadata).toEqual({ name: 'mock-file' });
    });

    it('validates URI before delegating', async () => {
      const handler = new MockHandler();
      registry.register(handler);

      await expect(registry.extractMetadata('invalid://uri')).rejects.toThrow();
    });
  });

  describe('getContentHash', () => {
    it('delegates to appropriate handler', async () => {
      const handler = new MockHandler();
      registry.register(handler);

      const hash = await registry.getContentHash('mock://test');
      expect(hash).toBe('sha256:mock123');
    });

    it('validates URI before delegating', async () => {
      const handler = new MockHandler();
      registry.register(handler);

      await expect(registry.getContentHash('invalid://uri')).rejects.toThrow();
    });
  });

  describe('getContent', () => {
    it('delegates to appropriate handler', async () => {
      const handler = new MockHandler();
      registry.register(handler);

      const content = await registry.getContent('mock://test');
      expect(content).toBe('mock content');
    });

    it('validates URI before delegating', async () => {
      const handler = new MockHandler();
      registry.register(handler);

      await expect(registry.getContent('invalid://uri')).rejects.toThrow();
    });
  });

  describe('watch', () => {
    it('delegates to handler with watch capability', () => {
      const handler = new MockWatchableHandler();
      registry.register(handler);

      const watcher = registry.watch('mock://test', () => {});
      expect(watcher).toHaveProperty('close');
    });

    it('throws if handler does not support watching', () => {
      const handler = new MockHandler();
      registry.register(handler);

      expect(() => {
        registry.watch('mock://test', () => {});
      }).toThrow('does not support watching');
    });

    it('throws for unsupported scheme', () => {
      expect(() => {
        registry.watch('unknown://test', () => {});
      }).toThrow('No handler registered');
    });
  });

  describe('open', () => {
    it('throws if handler does not support opening', async () => {
      const handler = new MockHandler();
      registry.register(handler);

      await expect(registry.open('mock://test')).rejects.toThrow('does not support opening');
    });

    it('throws for unsupported scheme', async () => {
      await expect(registry.open('unknown://test')).rejects.toThrow('No handler registered');
    });
  });

  describe('getSchemes', () => {
    it('returns all registered schemes', () => {
      const handler1 = new MockHandler();
      const handler2 = new MockWatchableHandler();

      handler2.scheme = 'mock2';

      registry.register(handler1);
      registry.register(handler2);

      const schemes = registry.getSchemes();
      expect(schemes).toContain('mock');
      expect(schemes).toContain('mock2');
    });

    it('returns empty array when no handlers registered', () => {
      expect(registry.getSchemes()).toEqual([]);
    });
  });

  describe('getHandlerInfo', () => {
    it('returns info about all handlers', () => {
      const handler = new MockHandler();
      registry.register(handler);

      const info = registry.getHandlerInfo();
      expect(info).toHaveLength(1);
      expect(info[0]).toEqual({
        scheme: 'mock',
        capabilities: handler.capabilities,
      });
    });

    it('returns empty array when no handlers registered', () => {
      expect(registry.getHandlerInfo()).toEqual([]);
    });
  });

  describe('multiple handlers', () => {
    it('manages multiple handlers independently', async () => {
      const handler1 = new MockHandler();
      const handler2 = new MockWatchableHandler();
      handler2.scheme = 'mock2';

      registry.register(handler1);
      registry.register(handler2);

      expect(registry.canHandle('mock://test')).toBe(true);
      expect(registry.canHandle('mock2://test')).toBe(true);
      expect(registry.canHandle('unknown://test')).toBe(false);

      const content1 = await registry.getContent('mock://test');
      expect(content1).toBe('mock content');

      const found2 = registry.findHandler('mock2://test');
      expect(found2.scheme).toBe('mock2');
    });
  });
});
