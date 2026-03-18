import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  StorageProvider,
  UploadFileParams,
  UploadResult,
} from './storage.interface';

@Injectable()
export class SupabaseStorageProvider implements StorageProvider, OnModuleInit {
  private readonly logger = new Logger(SupabaseStorageProvider.name);
  private supabase: SupabaseClient;
  private readonly bucket: string;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'Supabase storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables',
      );
    }

    this.supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.bucket = this.configService.get<string>('SUPABASE_STORAGE_BUCKET') || 'invoices';

    this.logger.log(`Supabase storage initialized with bucket: ${this.bucket}`);
  }

  async onModuleInit(): Promise<void> {
    // Check if bucket exists, create if not
    try {
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();

      if (listError) {
        this.logger.warn(`Could not list buckets: ${listError.message}`);
        return;
      }

      const bucketExists = buckets?.some((b) => b.name === this.bucket);

      if (!bucketExists) {
        this.logger.log(`Creating storage bucket: ${this.bucket}`);
        const { error: createError } = await this.supabase.storage.createBucket(
          this.bucket,
          {
            public: false, // Private bucket - use signed URLs
            fileSizeLimit: 10 * 1024 * 1024, // 10MB limit
            allowedMimeTypes: [
              'application/pdf',
              'image/png',
              'image/jpeg',
              'image/webp',
            ],
          },
        );

        if (createError) {
          this.logger.error(`Failed to create bucket: ${createError.message}`);
        } else {
          this.logger.log(`Bucket created successfully: ${this.bucket}`);
        }
      } else {
        this.logger.log(`Bucket exists: ${this.bucket}`);
      }
    } catch (error) {
      this.logger.error('Error initializing Supabase storage:', error);
    }
  }

  async uploadFile(params: UploadFileParams): Promise<UploadResult> {
    const { file, storagePath, mimeType } = params;

    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .upload(storagePath, file, {
        contentType: mimeType,
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    this.logger.log(`File uploaded to Supabase: ${data.path}`);

    return {
      storagePath: data.path,
    };
  }

  async getSignedDownloadUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, expiresInSeconds, {
        download: false, // Display inline in browser
      });

    if (error) {
      this.logger.error(`Failed to create signed URL: ${error.message}`);
      throw new Error(`Failed to create download URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  async deleteFile(storagePath: string): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .remove([storagePath]);

    if (error) {
      this.logger.error(`Delete failed: ${error.message}`);
      throw new Error(`Failed to delete file: ${error.message}`);
    }

    this.logger.log(`File deleted from Supabase: ${storagePath}`);
  }

  async fileExists(storagePath: string): Promise<boolean> {
    // Try to get file metadata
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .list(storagePath.split('/').slice(0, -1).join('/'), {
        search: storagePath.split('/').pop(),
      });

    if (error) {
      return false;
    }

    return data && data.length > 0;
  }
}
