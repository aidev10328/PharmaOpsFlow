export interface UploadFileParams {
  file: Buffer;
  originalName: string;
  mimeType: string;
  storagePath: string; // Full path where file should be stored
}

export interface UploadResult {
  storagePath: string;
  publicUrl?: string; // Only if bucket is public
}

export interface StorageProvider {
  /**
   * Upload a file to storage
   */
  uploadFile(params: UploadFileParams): Promise<UploadResult>;

  /**
   * Get a signed/temporary download URL for a file
   */
  getSignedDownloadUrl(storagePath: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Delete a file from storage
   */
  deleteFile(storagePath: string): Promise<void>;

  /**
   * Check if a file exists
   */
  fileExists(storagePath: string): Promise<boolean>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
