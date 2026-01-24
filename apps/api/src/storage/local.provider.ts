import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  StorageProvider,
  UploadFileParams,
  UploadResult,
} from './storage.interface';

@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalDiskStorageProvider.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    // Default to ./uploads relative to project root
    this.uploadDir = this.configService.get<string>('LOCAL_UPLOAD_DIR') ||
      path.join(process.cwd(), 'uploads');

    const apiPort = this.configService.get<string>('API_PORT') || '4000';
    this.baseUrl = this.configService.get<string>('API_BASE_URL') ||
      `http://localhost:${apiPort}`;

    this.logger.log(`Local storage initialized at: ${this.uploadDir}`);
  }

  async uploadFile(params: UploadFileParams): Promise<UploadResult> {
    const { file, storagePath } = params;

    // Create full path
    const fullPath = path.join(this.uploadDir, storagePath);
    const dirPath = path.dirname(fullPath);

    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, file);

    this.logger.log(`File uploaded to local storage: ${storagePath}`);

    return {
      storagePath,
    };
  }

  async getSignedDownloadUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
    // For local storage, we return a route that will serve the file
    // The actual file serving is handled by the controller
    // We add a simple timestamp-based token for basic security
    const expiry = Date.now() + (expiresInSeconds * 1000);
    const token = Buffer.from(`${storagePath}:${expiry}`).toString('base64url');

    return `${this.baseUrl}/invoice-files/local/${token}`;
  }

  async deleteFile(storagePath: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, storagePath);

    try {
      await fs.unlink(fullPath);
      this.logger.log(`File deleted from local storage: ${storagePath}`);

      // Try to clean up empty directories
      await this.cleanupEmptyDirs(path.dirname(fullPath));
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, that's okay
      this.logger.warn(`File not found for deletion: ${storagePath}`);
    }
  }

  async fileExists(storagePath: string): Promise<boolean> {
    const fullPath = path.join(this.uploadDir, storagePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the full file path for serving (used by controller)
   */
  getFullPath(storagePath: string): string {
    return path.join(this.uploadDir, storagePath);
  }

  /**
   * Verify and decode a local download token
   */
  verifyDownloadToken(token: string): { storagePath: string; valid: boolean } {
    try {
      const decoded = Buffer.from(token, 'base64url').toString();
      const [storagePath, expiryStr] = decoded.split(':');
      const expiry = parseInt(expiryStr, 10);

      if (Date.now() > expiry) {
        return { storagePath: '', valid: false };
      }

      return { storagePath, valid: true };
    } catch {
      return { storagePath: '', valid: false };
    }
  }

  private async cleanupEmptyDirs(dirPath: string): Promise<void> {
    // Don't delete the base upload directory
    if (dirPath === this.uploadDir || !dirPath.startsWith(this.uploadDir)) {
      return;
    }

    try {
      const files = await fs.readdir(dirPath);
      if (files.length === 0) {
        await fs.rmdir(dirPath);
        // Recursively check parent
        await this.cleanupEmptyDirs(path.dirname(dirPath));
      }
    } catch {
      // Ignore errors during cleanup
    }
  }
}
