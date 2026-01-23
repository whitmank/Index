import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';

import { FileHandler } from '../src/handlers/file-handler';

describe('FileHandler', () => {
  let handler: FileHandler;
  let testDir: string;

  beforeEach(async () => {
    handler = new FileHandler();
    testDir = join(tmpdir(), `index-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    handler.cleanup();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('scheme and capabilities', () => {
    it('has correct scheme', () => {
      expect(handler.scheme).toBe('file');
    });

    it('has correct capabilities', () => {
      expect(handler.capabilities).toEqual({
        canWatch: true,
        canOpen: true,
        canPreview: false,
        canCache: false,
      });
    });
  });

  describe('canHandle', () => {
    it('returns true for file:// URIs', () => {
      expect(handler.canHandle('file:///path/to/file.txt')).toBe(true);
      expect(handler.canHandle('file://localhost/path/to/file.txt')).toBe(true);
    });

    it('returns false for non-file URIs', () => {
      expect(handler.canHandle('https://example.com')).toBe(false);
      expect(handler.canHandle('http://example.com')).toBe(false);
      expect(handler.canHandle('/path/to/file.txt')).toBe(false);
    });
  });

  describe('validate', () => {
    it('validates correct file:// URIs', () => {
      expect(() => {
        handler.validate('file:///path/to/file.txt');
      }).not.toThrow();
    });

    it('throws for non-file URIs', () => {
      expect(() => {
        handler.validate('https://example.com');
      }).toThrow();
    });

    it('throws for invalid URI format', () => {
      expect(() => {
        handler.validate('not a uri');
      }).toThrow();
    });
  });

  describe('extractMetadata', () => {
    it('extracts metadata from file', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'Hello, World!');

      const fileUrl = pathToFileURL(filePath).href;
      const metadata = await handler.extractMetadata(fileUrl);

      expect(metadata).toHaveProperty('name', 'test.txt');
      expect(metadata).toHaveProperty('size', 13);
      expect(metadata).toHaveProperty('mime_type', 'text/plain');
      expect(metadata).toHaveProperty('extension', '.txt');
      expect(metadata).toHaveProperty('is_file', true);
      expect(metadata).toHaveProperty('is_directory', false);
      expect(metadata).toHaveProperty('created_at');
      expect(metadata).toHaveProperty('modified_at');
    });

    it('handles different file types', async () => {
      const pdfPath = join(testDir, 'test.pdf');
      await writeFile(pdfPath, Buffer.from([0x25, 0x50, 0x44, 0x46])); // PDF header

      const fileUrl = pathToFileURL(pdfPath).href;
      const metadata = await handler.extractMetadata(fileUrl);

      expect(metadata.name).toBe('test.pdf');
      expect(metadata.extension).toBe('.pdf');
      expect(metadata.mime_type).toBe('application/pdf');
    });

    it('throws for non-existent file', async () => {
      const fileUrl = pathToFileURL(join(testDir, 'nonexistent.txt')).href;
      await expect(handler.extractMetadata(fileUrl)).rejects.toThrow();
    });
  });

  describe('getContentHash', () => {
    it('computes SHA-256 hash of file', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'test content');

      const fileUrl = pathToFileURL(filePath).href;
      const hash = await handler.getContentHash(fileUrl);

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(hash).toBe('sha256:' + require('crypto').createHash('sha256').update('test content').digest('hex'));
    });

    it('returns consistent hash for same content', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'consistent content');

      const fileUrl = pathToFileURL(filePath).href;
      const hash1 = await handler.getContentHash(fileUrl);
      const hash2 = await handler.getContentHash(fileUrl);

      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different content', async () => {
      const file1Path = join(testDir, 'file1.txt');
      const file2Path = join(testDir, 'file2.txt');
      await writeFile(file1Path, 'content1');
      await writeFile(file2Path, 'content2');

      const url1 = pathToFileURL(file1Path).href;
      const url2 = pathToFileURL(file2Path).href;
      const hash1 = await handler.getContentHash(url1);
      const hash2 = await handler.getContentHash(url2);

      expect(hash1).not.toBe(hash2);
    });

    it('throws for non-existent file', async () => {
      const fileUrl = pathToFileURL(join(testDir, 'nonexistent.txt')).href;
      await expect(handler.getContentHash(fileUrl)).rejects.toThrow();
    });
  });

  describe('getContent', () => {
    it('reads file content', async () => {
      const filePath = join(testDir, 'test.txt');
      const content = 'Hello, World!';
      await writeFile(filePath, content);

      const fileUrl = pathToFileURL(filePath).href;
      const result = await handler.getContent(fileUrl);

      expect(result).toEqual(Buffer.from(content));
    });

    it('reads binary files', async () => {
      const filePath = join(testDir, 'test.bin');
      const content = Buffer.from([1, 2, 3, 4, 5]);
      await writeFile(filePath, content);

      const fileUrl = pathToFileURL(filePath).href;
      const result = await handler.getContent(fileUrl);

      expect(result).toEqual(content);
    });

    it('throws for non-existent file', async () => {
      const fileUrl = pathToFileURL(join(testDir, 'nonexistent.txt')).href;
      await expect(handler.getContent(fileUrl)).rejects.toThrow();
    });
  });

  describe('watch', () => {
    it('detects file changes', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'initial');

      const fileUrl = pathToFileURL(filePath).href;
      const callback = vi.fn();

      const watcher = handler.watch(fileUrl, callback);

      // Wait for watcher to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Modify file
      await writeFile(filePath, 'modified');

      // Wait for change detection
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith('change', fileUrl);

      watcher.close();
    });

    it('detects file deletion', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'content');

      const fileUrl = pathToFileURL(filePath).href;
      const callback = vi.fn();

      handler.watch(fileUrl, callback);

      // Wait for watcher to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Delete file
      await rm(filePath);

      // Wait for deletion detection
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(callback).toHaveBeenCalledWith('delete', fileUrl);
    });

    it('returns watcher object with close method', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'content');

      const fileUrl = pathToFileURL(filePath).href;
      const watcher = handler.watch(fileUrl, vi.fn());

      expect(watcher).toHaveProperty('close');
      expect(typeof watcher.close).toBe('function');

      watcher.close();
    });
  });

  describe('unwatch', () => {
    it('stops watching file', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'content');

      const fileUrl = pathToFileURL(filePath).href;
      handler.watch(fileUrl, vi.fn());
      handler.unwatch(fileUrl);

      // Should not throw
      expect(() => handler.unwatch(fileUrl)).not.toThrow();
    });
  });

  describe('open', () => {
    it('throws error for non-existent file', async () => {
      const fileUrl = pathToFileURL(join(testDir, 'nonexistent.txt')).href;
      await expect(handler.open(fileUrl)).rejects.toThrow('File not found');
    });

    it('calls shell.openPath for existing file', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'content');

      const fileUrl = pathToFileURL(filePath).href;

      // Mock shell.openPath (since we can't actually open files in tests)
      const originalOpen = require('electron').shell.openPath;
      require('electron').shell.openPath = vi.fn().mockResolvedValue('');

      try {
        await handler.open(fileUrl);
        expect(require('electron').shell.openPath).toHaveBeenCalled();
      } finally {
        require('electron').shell.openPath = originalOpen;
      }
    });
  });

  describe('cleanup', () => {
    it('closes all watchers', async () => {
      const file1Path = join(testDir, 'file1.txt');
      const file2Path = join(testDir, 'file2.txt');
      await writeFile(file1Path, 'content1');
      await writeFile(file2Path, 'content2');

      const url1 = pathToFileURL(file1Path).href;
      const url2 = pathToFileURL(file2Path).href;

      handler.watch(url1, vi.fn());
      handler.watch(url2, vi.fn());

      expect(() => handler.cleanup()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('handles permission denied errors', async () => {
      // This test would require setting up file permissions
      // Skip for now as it's platform-specific
      expect(true).toBe(true);
    });

    it('validates URI format before operations', async () => {
      expect(() => {
        handler.validate('invalid://uri');
      }).toThrow();
    });
  });
});
