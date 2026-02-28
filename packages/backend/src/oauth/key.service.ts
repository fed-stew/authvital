import { Injectable, Logger } from '@nestjs/common';
import { KeyManagerService, SigningKeyPair } from './key-manager.service';

// Re-export for consumers
export { SigningKeyPair };
import * as jose from 'jose';

/**
 * KeyService: Facade for JWT signing operations
 * 
 * Delegates to KeyManagerService for key management.
 * Provides a clean interface for signing and verifying JWTs.
 * 
 * This replaces the old file-based key storage with database-backed
 * key management that supports rotation and clustered deployments.
 */
@Injectable()
export class KeyService {
  private readonly logger = new Logger(KeyService.name);

  constructor(private readonly keyManager: KeyManagerService) {}

  /**
   * Get JWKS (JSON Web Key Set) for public key distribution
   * Endpoint: /.well-known/jwks.json
   */
  async getJwks(): Promise<{ keys: jose.JWK[] }> {
    return this.keyManager.getPublicJWKS();
  }

  /**
   * Sign a JWT with the active private key
   */
  async signJwt(
    payload: Record<string, unknown>,
    options: {
      subject: string;
      audience?: string;
      issuer: string;
      expiresIn: number; // seconds
    },
  ): Promise<string> {
    const keyPair = await this.keyManager.getSigningKey();

    const jwt = new jose.SignJWT(payload)
      .setProtectedHeader({ alg: keyPair.algorithm, kid: keyPair.kid, typ: 'JWT' })
      .setIssuedAt()
      .setSubject(options.subject)
      .setIssuer(options.issuer)
      .setExpirationTime(Math.floor(Date.now() / 1000) + options.expiresIn);

    if (options.audience) {
      jwt.setAudience(options.audience);
    }

    return jwt.sign(keyPair.privateKey);
  }

  /**
   * Verify a JWT using the public key
   * Automatically uses JWKS to find the right key by kid
   */
  async verifyJwt(token: string, issuer: string): Promise<jose.JWTPayload> {
    // Get JWKS for verification (includes both ACTIVE and PASSIVE keys)
    const jwks = await this.keyManager.getPublicJWKS();
    
    // Create a local JWKS for jose to use
    const keySet = jose.createLocalJWKSet(jwks);
    
    const { payload } = await jose.jwtVerify(token, keySet, {
      issuer,
    });
    
    return payload;
  }

  /**
   * Get the current active key ID
   */
  async getKeyId(): Promise<string> {
    const keyPair = await this.keyManager.getSigningKey();
    return keyPair.kid;
  }

  /**
   * Get the active signing key pair (for raw crypto operations like webhook signing)
   */
  async getActiveKey(): Promise<SigningKeyPair> {
    return this.keyManager.getSigningKey();
  }

  /**
   * Rotate keys (for admin operations)
   */
  async rotateKeys(): Promise<{ newKid: string; demotedKid: string | null }> {
    return this.keyManager.rotateKeys();
  }

  /**
   * Get key statistics (for monitoring/admin)
   */
  async getKeyStats() {
    return this.keyManager.getKeyStats();
  }
}
