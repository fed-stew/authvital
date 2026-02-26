import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyService } from './key.service';

/**
 * Well-Known Controller
 * 
 * Serves OIDC discovery endpoints at the standard locations:
 * - /.well-known/openid-configuration
 * - /.well-known/jwks.json
 * 
 * These endpoints MUST be at the root (not under /api) per OIDC spec.
 */
@Controller('.well-known')
export class WellKnownController {
  private readonly issuer: string;

  constructor(
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  /**
   * OpenID Connect Discovery Document
   * https://openid.net/specs/openid-connect-discovery-1_0.html
   */
  @Get('openid-configuration')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('Content-Type', 'application/json')
  async openidConfiguration() {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/oauth/authorize`,
      token_endpoint: `${this.issuer}/oauth/token`,
      userinfo_endpoint: `${this.issuer}/oauth/userinfo`,
      jwks_uri: `${this.issuer}/.well-known/jwks.json`,
      revocation_endpoint: `${this.issuer}/oauth/revoke`,
      introspection_endpoint: `${this.issuer}/oauth/introspect`,
      end_session_endpoint: `${this.issuer}/oauth/logout`,
      
      // Supported features
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
      
      // Scopes
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
      
      // Claims
      claims_supported: [
        'sub',
        'iss',
        'aud',
        'exp',
        'iat',
        'email',
        'email_verified',
        'name',
        'given_name',
        'family_name',
        'picture',
        'tenant_id',
        'tenant_subdomain',
        'tenant_roles',
        'tenant_permissions',
        'app_roles',
      ],
    };
  }

  /**
   * JSON Web Key Set (JWKS)
   * Contains public keys for token verification
   * https://datatracker.ietf.org/doc/html/rfc7517
   */
  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('Content-Type', 'application/json')
  async jwks() {
    return this.keyService.getJwks();
  }
}
