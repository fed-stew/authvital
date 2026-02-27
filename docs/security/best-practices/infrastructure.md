# Infrastructure Security

> HTTPS, cookies, CORS, security headers, database & secrets.

## HTTPS Everywhere

```nginx
# Force HTTPS
server {
    listen 80;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    # SSL configuration...
}
```

---

## Secure Cookies

```typescript
// Production cookie settings
res.cookie('auth_token', token, {
  httpOnly: true,     // No JavaScript access
  secure: true,       // HTTPS only
  sameSite: 'lax',    // CSRF protection
  maxAge: 3600000,    // 1 hour
});
```

---

## CORS Configuration

```typescript
// ✅ Specific origins
CORS_ORIGINS=https://app.example.com,https://admin.example.com

// ❌ Never in production
CORS_ORIGINS=*  // Allows any origin!
```

---

## Security Headers

**Essential HTTP headers** to protect against common attacks:

| Header | Purpose | Risk if Missing |
|--------|---------|----------------|
| **HSTS** | Forces HTTPS | Downgrade attacks |
| **CSP** | Blocks XSS/injection | Script injection |
| **X-Frame-Options** | Prevents clickjacking | UI redress attacks |
| **X-Content-Type-Options** | Stops MIME sniffing | Content confusion |
| **Referrer-Policy** | Controls referrer info | URL data leaks |
| **Permissions-Policy** | Restricts browser features | Feature abuse |

### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    # HSTS - Force HTTPS for 1 year, include subdomains
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # CSP - Control what resources can load
    add_header Content-Security-Policy "
        default-src 'self';
        script-src 'self' https://cdn.example.com;
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: https:;
        font-src 'self';
        connect-src 'self' https://api.authvital.com;
        frame-ancestors 'none';
        base-uri 'self';
        form-action 'self';
    " always;

    # Clickjacking protection
    add_header X-Frame-Options "DENY" always;

    # Prevent MIME type sniffing
    add_header X-Content-Type-Options "nosniff" always;

    # Control referrer information
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Restrict browser features
    add_header Permissions-Policy "
        accelerometer=(),
        camera=(),
        geolocation=(),
        gyroscope=(),
        magnetometer=(),
        microphone=(),
        payment=(),
        usb=()
    " always;
}
```

### Header Details

**HSTS (Strict-Transport-Security)**
```nginx
# Minimum recommended
add_header Strict-Transport-Security "max-age=31536000" always;

# With subdomains (recommended if all subdomains support HTTPS)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Ready for browser preload list (most secure)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

**CSP (Content-Security-Policy)**
```nginx
# ✅ Strict CSP - blocks most XSS attacks
add_header Content-Security-Policy "
    default-src 'self';
    script-src 'self';
    style-src 'self';
    img-src 'self' data:;
    connect-src 'self' https://api.authvital.com;
    frame-ancestors 'none';
" always;

# ⚠️ Development CSP - more permissive for debugging
add_header Content-Security-Policy "
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
" always;
```

**X-Frame-Options**
```nginx
# ✅ Completely deny framing (most secure)
add_header X-Frame-Options "DENY" always;

# ⚠️ Allow same-origin framing only
add_header X-Frame-Options "SAMEORIGIN" always;
```

### Testing Your Headers

```bash
# Quick test with curl
curl -I https://your-app.com | grep -i "strict\|security\|frame\|content-type\|referrer\|permissions"

# Or use online tools:
# - https://securityheaders.com
# - https://observatory.mozilla.org
```

---

## Database Security

```bash
# ✅ Strong passwords
DB_PASSWORD=long-random-string-32-chars-minimum

# ✅ Separate credentials per environment
# dev: authvital_dev / dev-password
# prod: authvital_prod / secure-prod-password

# ✅ Principle of least privilege
# App user shouldn't have DROP TABLE permissions
```

---

## Secret Management

### Environment Variables

```bash
# ✅ Use secret managers in production
# - Google Secret Manager
# - AWS Secrets Manager
# - HashiCorp Vault
# - Doppler

# ❌ Don't commit secrets
.env          # In .gitignore
.env.local    # In .gitignore
```

### Key Rotation

```bash
# Rotate signing keys periodically (AuthVital does this automatically)
KEY_ROTATION_INTERVAL_SECONDS=604800  # 7 days

# ⚠️ Rotating SIGNING_KEY_SECRET invalidates all tokens!
# Plan for this: users will need to re-login
```

### Webhook Secrets

```typescript
// ✅ Always verify webhook signatures (RSA-SHA256 via JWKS)
const router = new WebhookRouter({
  authVitalHost: process.env.AV_HOST,  // JWKS URL derived automatically
  handler: myHandler,
});

// ❌ Never skip signature verification
app.post('/webhooks', (req, res) => {
  // Missing signature check = anyone can call this!
  handleEvent(req.body);
});
```

---

## Related Documentation

- [Authentication Security](./authentication.md)
- [OAuth Security](./oauth.md)
- [Security Checklist](./checklist.md)
