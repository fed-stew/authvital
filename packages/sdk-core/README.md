# @authvital/core

<p align="center">
  <strong>Environment-agnostic core SDK for AuthVital</strong>
</p>

<p align="center">
  <a href="https://npmjs.com/package/@authvital/core">
    <img src="https://img.shields.io/npm/v/@authvital/core" alt="npm version" />
  </a>
  <a href="https://github.com/intersparkio/authvital/blob/main/packages/sdk-core/LICENSE">
    <img src="https://img.shields.io/npm/l/@authvital/core" alt="license" />
  </a>
</p>

```bash
npm install @authvital/core
```

## What is @authvital/core?

`@authvital/core` is the environment-agnostic foundation of the AuthVital SDK ecosystem. It contains all the platform-agnostic logic needed for authentication and authorization, without any dependencies on browser APIs or server-specific functionality.

### Key Characteristics

- ✅ **Environment-agnostic** - Works in browsers, Node.js, Deno, Bun, or any JavaScript runtime
- ✅ **Pure functions** - No side effects, making code predictable and testable
- ✅ **No storage dependencies** - Contains no localStorage, cookie, or storage APIs
- ✅ **No window/document references** - Safe for server-side rendering and edge runtimes
- ✅ **Used by all adapters** - Powers `@authvital/react`, `@authvital/next`, and server-side packages
- ✅ **TypeScript-first** - Full type safety with comprehensive interfaces

### What This Package Contains

| Module | Purpose |
|--------|---------|
| `/types` | TypeScript interfaces and type definitions |
| `/api` | API endpoint constants and URL builders |
| `/oauth` | OAuth 2.0 / PKCE utilities and URL generation |
| `/errors` | Error classes for auth, OAuth, and API errors |
| `/utils` | JWT validation, formatters, and utility functions |

### What This Package Does NOT Contain

- ❌ localStorage or sessionStorage access
- ❌ Cookie parsing or setting
- ❌ `window` or `document` usage
- ❌ Fetch/XHR (network layer is adapter responsibility)
- ❌ Storage persistence logic
- ❌ React hooks or components
- ❌ Node.js-specific APIs

## Installation

```bash
npm install @authvital/core
```

### Package Exports

This package uses conditional exports, allowing you to import only what you need:

```ts
// Import everything
import { User, TokenResponse, generateCodeVerifier } from '@authvital/core';

// Import specific modules (recommended for tree-shaking)
import type { User, AuthResponse } from '@authvital/core/types';
import { buildAuthorizeUrl } from '@authvital/core/oauth';
import { AuthenticationError, isAuthVitalError } from '@authvital/core/errors';
```

## Modules

### `/types` - TypeScript Interfaces

Complete TypeScript type definitions for the AuthVital platform:

```ts
import type {
  User,              // User entity
  ClientUser,        // Simplified user for UI
  AuthResponse,      // Login response
  TokenResponse,     // OAuth token response
  JWTClaims,         // JWT structure
  Tenant,            // Organization/tenant
  Session,           // Session data
  OAuthConfig,       // OAuth configuration
} from '@authvital/core/types';
```

### `/api` - API Endpoint Definitions

URL builders and endpoint constants:

```ts
import {
  OAUTH_AUTHORIZE,        // /oauth2/authorize
  OAUTH_TOKEN,            // /oauth2/token
  OAUTH_USERINFO,         // /oauth2/userinfo
  getTenantById,          // /admin/tenants/:id
  getUserById,            // /admin/users/:id
} from '@authvital/core/api';
```

### `/oauth` - OAuth & PKCE Utilities

OAuth 2.0 / OpenID Connect utilities without storage dependencies:

```ts
import {
  generateCodeVerifier,      // Create PKCE code verifier
  generateCodeChallenge,     // Create S256 challenge
  generatePKCEAsync,         // Generate both PKCE values
  buildAuthorizeUrl,         // Build OAuth authorize URL
  buildTokenUrl,             // Build token endpoint URL
  getLoginUrl,               // Convenience for login redirect
  getLogoutUrl,              // Convenience for logout redirect
  getRegisterUrl,            // Convenience for register redirect
} from '@authvital/core/oauth';
```

### `/errors` - Error Classes

Standardized error handling:

```ts
import {
  AuthenticationError,       // Login/auth failures
  AuthorizationError,        // Permission/access denied
  OAuthError,                // OAuth flow errors
  ApiError,                  // API request errors
  ValidationError,           // Input validation errors
  isAuthVitalError,          // Type guard
  isAuthenticationError,     // Specific type guard
  isOAuthError,              // Specific type guard
} from '@authvital/core/errors';
```

### `/utils` - Validation & Formatters

JWT validation and formatting utilities:

```ts
import {
  createJwtValidator,        // JWT validation factory
  validateJwt,               // One-off JWT validation
  createBearerHeader,        // Create Authorization header
  formatDate,                // Date formatting
  buildUrl,                  // URL with query params
  safeJsonParse,             // Safe JSON parsing
} from '@authvital/core/utils';
```

## Usage Examples

### Import Types

```ts
import type { User, AuthResponse, TokenResponse } from '@authvital/core/types';

function handleAuth(response: AuthResponse): User {
  return {
    id: response.user.id,
    email: response.user.email,
    // ...
  };
}
```

### Build OAuth URLs

```ts
import { generatePKCEAsync, buildAuthorizeUrl } from '@authvital/core/oauth';

async function startOAuthFlow() {
  // Generate PKCE parameters
  const { codeVerifier, codeChallenge } = await generatePKCEAsync();
  
  // Store codeVerifier securely for the callback
  // (storage is adapter responsibility - this package is agnostic)
  
  // Build authorization URL
  const authorizeUrl = buildAuthorizeUrl({
    authVitalHost: 'https://auth.example.com',
    clientId: 'my-app',
    redirectUri: 'https://app.example.com/callback',
    state: generateCSRFToken(), // Your CSRF protection
    codeChallenge,
    scope: 'openid profile email',
  });
  
  // Redirect user to authorizeUrl
  return authorizeUrl;
}
```

### Validate JWTs

```ts
import { createJwtValidator } from '@authvital/core/utils';

const validator = createJwtValidator({
  authVitalHost: 'https://auth.example.com',
  // Optional: provide public key for offline validation
  // publicKey: await fetchPublicKey(),
});

async function validateToken(token: string) {
  const result = await validator.validateToken(token, {
    requiredClaims: ['sub', 'email', 'tenant_id'],
  });
  
  if (result.valid) {
    return result.claims;
  } else {
    throw new Error(`Invalid token: ${result.error}`);
  }
}
```

### Handle Errors

```ts
import {
  AuthenticationError,
  OAuthError,
  isAuthenticationError,
  isOAuthError,
} from '@authvital/core/errors';

try {
  const response = await exchangeCodeForToken(code, codeVerifier);
} catch (error) {
  if (isAuthenticationError(error)) {
    // Handle login failure - invalid credentials, user not found, etc.
    console.error('Authentication failed:', error.message);
    showLoginError(error.userMessage);
  } else if (isOAuthError(error)) {
    // Handle OAuth-specific errors
    console.error('OAuth error:', error.oauthError);
    console.error('Description:', error.errorDescription);
    redirectToLogin();
  } else {
    // Handle unexpected errors
    console.error('Unknown error:', error);
  }
}
```

### API URL Building

```ts
import { OAUTH_TOKEN, getTenantById } from '@authvital/core/api';

const tokenUrl = `${authVitalHost}${OAUTH_TOKEN}`;
// → https://auth.example.com/oauth2/token

const tenantUrl = `${authVitalHost}${getTenantById('tenant_123')}`;
// → https://auth.example.com/admin/tenants/tenant_123
```

## For SDK Authors

### Building on Top of Core

`@authvital/core` is designed to be the foundation for environment-specific SDKs. If you're building a custom adapter:

1. **Add `@authvital/core` as a dependency**
   ```json
   {
     "dependencies": {
       "@authvital/core": "^1.0.0"
     }
   }
   ```

2. **Import the modules you need**
   ```ts
   import type { User, AuthResponse } from '@authvital/core/types';
   import { buildAuthorizeUrl, generatePKCEAsync } from '@authvital/core/oauth';
   import { createJwtValidator } from '@authvital/core/utils';
   import { isAuthVitalError } from '@authvital/core/errors';
   ```

3. **Implement environment-specific storage**
   
   Your adapter is responsible for:
   - Token storage (localStorage, cookies, memory, etc.)
   - Session persistence
   - State management (React context, Vue stores, etc.)
   - Network layer (fetch, axios, etc.)

### Adapter Pattern Example

```ts
// my-custom-adapter.ts
import type { User, AuthResponse } from '@authvital/core/types';
import { buildAuthorizeUrl, generatePKCEAsync } from '@authvital/core/oauth';

export interface CustomAdapterConfig {
  authVitalHost: string;
  clientId: string;
  redirectUri: string;
  // Add your adapter-specific options
  storage: Storage; // Your storage implementation
}

export class CustomAdapter {
  private config: CustomAdapterConfig;
  
  constructor(config: CustomAdapterConfig) {
    this.config = config;
  }
  
  async login(): Promise<void> {
    const { codeVerifier, codeChallenge } = await generatePKCEAsync();
    
    // Store verifier using your adapter's storage
    await this.config.storage.setItem('code_verifier', codeVerifier);
    
    // Build URL using core
    const url = buildAuthorizeUrl({
      authVitalHost: this.config.authVitalHost,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      codeChallenge,
      // ...
    });
    
    // Handle redirect using your adapter's method
    this.redirect(url);
  }
  
  // ... implement rest of adapter
}
```

### Available Adapters

- `@authvital/react` - React hooks and context provider
- `@authvital/next` - Next.js App Router integration
- `@authvital/node` - Server-side Node.js utilities

## API Reference

For complete API documentation, see:

- [Generated TypeDoc](https://authvital.dev/docs/api/core) - Full API reference with types
- [GitHub Repository](https://github.com/intersparkio/authvital) - Source code and examples
- [Integration Guide](https://authvital.dev/docs/integrations) - Step-by-step setup guides

## License

MIT © [Interspark](https://interspark.io)

---

<p align="center">
  Built with ❤️ by the AuthVital team
</p>
