import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KeyService } from './key.service';
import { KeyManagerService } from './key-manager.service';
import { KeyEncryptionService } from './key-encryption.service';

/**
 * KeyModule: Provides RSA key management for JWT signing/verification
 * 
 * Separated from OAuthModule to avoid circular dependencies.
 * Both AuthModule and OAuthModule can import this.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    KeyEncryptionService,
    KeyManagerService,
    KeyService,
  ],
  exports: [
    KeyService,
    KeyManagerService,
    KeyEncryptionService,
  ],
})
export class KeyModule {}
