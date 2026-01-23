import { createHash } from 'crypto';
import { createReadStream } from 'fs';

/**
 * Calculate SHA-256 hash of a file using streaming
 * Efficient for both small and large files
 *
 * @param filePath - Absolute path to file
 * @returns Hash in format "sha256:abc123..."
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      const digest = hash.digest('hex');
      resolve(`sha256:${digest}`);
    });

    stream.on('error', (error) => {
      reject(new Error(`Failed to hash file ${filePath}: ${error instanceof Error ? error.message : String(error)}`));
    });
  });
}
