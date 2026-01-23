import { stat } from 'fs/promises';
import { extname, basename } from 'path';
import mime from 'mime-types';

export interface FileMetadata {
  name: string;
  size: number;
  mime_type: string;
  extension: string;
  is_directory: boolean;
  is_file: boolean;
  is_symlink: boolean;
  permissions: number;
  created_at: string;
  modified_at: string;
  uid?: number;
  gid?: number;
  [key: string]: unknown; // Allow additional properties for ExtractedMetadata compatibility
}

/**
 * Extract metadata from a file
 *
 * @param filePath - Absolute path to file
 * @returns Metadata object
 */
export async function extractFileMetadata(filePath: string): Promise<FileMetadata> {
  try {
    const stats = await stat(filePath);
    const extension = extname(filePath);
    const mimeType = (mime.lookup(filePath) || 'application/octet-stream') as string;

    return {
      name: basename(filePath),
      size: stats.size,
      mime_type: mimeType,
      extension,
      is_directory: stats.isDirectory(),
      is_file: stats.isFile(),
      is_symlink: stats.isSymbolicLink(),
      permissions: stats.mode,
      created_at: stats.birthtime.toISOString(),
      modified_at: stats.mtime.toISOString(),
      uid: stats.uid,
      gid: stats.gid,
    };
  } catch (error) {
    throw new Error(
      `Failed to extract metadata from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
