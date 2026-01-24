import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage.interface';
import { LocalDiskStorageProvider } from './local.provider';
import { SupabaseStorageProvider } from './supabase.provider';

const logger = new Logger('StorageModule');

@Global()
@Module({
  providers: [
    LocalDiskStorageProvider, // Always available for local file serving
    {
      provide: STORAGE_PROVIDER,
      useFactory: (configService: ConfigService, localProvider: LocalDiskStorageProvider) => {
        const storageProvider = configService.get<string>('STORAGE_PROVIDER') || 'auto';
        const supabaseUrl = configService.get<string>('SUPABASE_URL');
        const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

        // Auto-detect: use Supabase if credentials are available
        if (storageProvider === 'auto') {
          if (supabaseUrl && supabaseKey) {
            logger.log('Using Supabase storage (auto-detected)');
            return new SupabaseStorageProvider(configService);
          } else {
            logger.log('Using local disk storage (Supabase credentials not found)');
            return localProvider;
          }
        }

        // Explicit provider selection
        if (storageProvider === 'supabase') {
          if (!supabaseUrl || !supabaseKey) {
            throw new Error(
              'STORAGE_PROVIDER is set to "supabase" but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing',
            );
          }
          logger.log('Using Supabase storage (explicit)');
          return new SupabaseStorageProvider(configService);
        }

        logger.log('Using local disk storage (explicit)');
        return localProvider;
      },
      inject: [ConfigService, LocalDiskStorageProvider],
    },
  ],
  exports: [STORAGE_PROVIDER, LocalDiskStorageProvider],
})
export class StorageModule {}
