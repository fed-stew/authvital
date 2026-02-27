# OAuth Security

> Redirect URI validation, state parameter, subdomain takeover prevention.

## Redirect URI Validation

**Register specific URIs** - avoid wildcards in production:

```typescript
// ✅ Good: Specific URIs
redirectUris: [
  'https://app.example.com/callback',
  'https://app.example.com/auth/callback',
]

// ⚠️ Caution: Wildcards only for development
redirectUris: [
  'http://localhost:*/callback',
]

// ❌ Bad: Too permissive
redirectUris: [
  'https://*.example.com/*', // Could allow attacker subdomains
]
```

---

## State Parameter

**Always validate state** to prevent CSRF:

```typescript
import { generateState, encodeState, decodeState } from '@authvital/sdk/server';

// Before redirect - use SDK's state utilities
const state = generateState(); // Cryptographically secure
sessionStorage.setItem('oauth_state', state);

// Or encode custom data in state:
const stateWithData = encodeState({ returnTo: '/dashboard', nonce: generateState() });

// After callback
const returnedState = urlParams.get('state');
if (returnedState !== sessionStorage.getItem('oauth_state')) {
  throw new Error('State mismatch - possible CSRF attack');
}
sessionStorage.removeItem('oauth_state'); // Clean up after validation
```

---

## Client Secret Protection

```bash
# ✅ Server-side only
# .env (backend)
AUTHVITAL_CLIENT_SECRET=secret_xxx

# ❌ Never in client code
# .env (frontend) - WRONG!
VITE_AUTHVITAL_CLIENT_SECRET=secret_xxx  # Exposed in browser!
```

---

## Why Exact-Match URIs Are Safest

**Exact-match redirect URIs** are the gold standard for OAuth security:

```typescript
// ✅ Best: Exact-match URIs
redirectUris: [
  'https://app.example.com/auth/callback',
  'https://app.example.com/oauth/callback',
]

// The redirect_uri in the request must match EXACTLY
// ✅ 'https://app.example.com/auth/callback' → Allowed
// ❌ 'https://app.example.com/auth/callback/' → Blocked (trailing slash)
// ❌ 'https://app.example.com/auth/callback?foo=bar' → Blocked (query params)
// ❌ 'https://APP.example.com/auth/callback' → Blocked (case mismatch)
```

| Validation Type | Security | Risk |
|-----------------|----------|------|
| **Exact match** | ✅ Strongest | None |
| **Prefix match** | ⚠️ Risky | Path traversal: `/callback/../evil` |
| **Regex match** | ⚠️ Very risky | Regex bugs, ReDoS attacks |
| **Wildcard subdomains** | ❌ Dangerous | Subdomain takeover |
| **No validation** | ❌ Critical | Open redirect → token theft |

---

## Risks of Wildcard Subdomains

**Never use wildcard subdomains in production redirect URIs.**

```typescript
// ❌ DANGEROUS: Wildcard subdomain
redirectUris: [
  'https://*.example.com/callback',
]
```

### Subdomain Takeover Attack

Subdomain takeover occurs when an attacker gains control of an unused subdomain:

```
1. Company registers wildcard: https://*.example.com/callback

2. Attacker finds abandoned subdomain:
   - old-app.example.com → Points to deprovisioned Heroku app
   - staging.example.com → Dangling CNAME to deleted S3 bucket

3. Attacker claims the abandoned resource

4. Attack flow:
   - Attacker crafts OAuth URL: redirect_uri=https://old-app.example.com/callback
   - User authenticates (looks legitimate!)
   - Auth code sent to attacker's server
   - 💀 Account compromised
```

**Common subdomain takeover targets:**

| Service | Vulnerable When | Indicator |
|---------|-----------------|----------|
| **Heroku** | App deleted, DNS remains | "No such app" error |
| **AWS S3** | Bucket deleted, CNAME exists | "NoSuchBucket" error |
| **GitHub Pages** | Repo deleted/renamed | 404 page |
| **Azure** | Resource deprovisioned | NXDOMAIN or Azure error |
| **Netlify** | Site deleted | Netlify 404 page |

---

## Safe vs Dangerous Patterns

### ✅ Safe Patterns

```typescript
// Production: Exact URIs only
redirectUris: [
  'https://app.example.com/auth/callback',
  'https://admin.example.com/auth/callback',
]

// Mobile apps: Custom schemes
redirectUris: [
  'com.example.myapp://auth/callback',
]

// Desktop apps: Localhost with specific ports
redirectUris: [
  'http://localhost:3000/callback',
  'http://127.0.0.1:3000/callback',
]
```

### ❌ Dangerous Patterns

```typescript
// ❌ Wildcard subdomain - subdomain takeover risk
redirectUris: ['https://*.example.com/callback']

// ❌ Wildcard path - path traversal risk
redirectUris: ['https://app.example.com/*']

// ❌ HTTP in production - MITM attacks
redirectUris: ['http://app.example.com/callback']

// ❌ Third-party domains - you don't control them
redirectUris: ['https://myapp.herokuapp.com/callback']
```

---

## How AuthVital Validates Redirect URIs

```typescript
// AuthVital's validation rules:
// 1. Protocol must match exactly
// 2. Host must match (case-insensitive)
// 3. Port must match (including defaults)
// 4. Path must match exactly (case-sensitive)
// 5. Query params allowed but not matched
// 6. Fragments stripped
// 7. HTTPS required for non-localhost
// 8. Dangerous protocols blocked (data:, javascript:)
```

**Configuration options:**

```bash
# Strict mode (recommended for production)
REDIRECT_URI_STRICT_MODE=true

# Allow localhost wildcards (development only!)
ALLOW_LOCALHOST_WILDCARDS=false  # true in dev

# Allow HTTP for localhost
ALLOW_LOCALHOST_HTTP=true  # Required for local dev
```

---

## Redirect URI Audit Checklist

### For Each OAuth Client:

- [ ] List all registered redirect URIs
- [ ] Verify each URI is still in active use
- [ ] Confirm the domain/subdomain is still controlled by your org
- [ ] Check for dangling DNS records (CNAME, A records)
- [ ] Verify HTTPS is enforced (no HTTP in production)
- [ ] Remove any URIs for decommissioned apps/environments

### Organization-Wide:

- [ ] Scan for subdomain takeover vulnerabilities
- [ ] Review recently added redirect URIs
- [ ] Check for overly permissive patterns (wildcards)
- [ ] Verify separate OAuth apps for prod/staging/dev

> 🗓️ **Recommendation:** Add "Redirect URI Audit" to your quarterly security review calendar.

---

## Related Documentation

- [Authentication Security](./authentication.md)
- [Infrastructure Security](./infrastructure.md)
- [Security Checklist](./checklist.md)
