# Security Checklist

> Pre-production and ongoing security checklists.

## Before Production

### Infrastructure

- [ ] HTTPS enabled with valid certificate
- [ ] `COOKIE_SECURE=true`
- [ ] Security headers configured (HSTS, CSP, X-Frame-Options)
- [ ] CORS restricted to specific origins

### Authentication

- [ ] Strong `SIGNING_KEY_SECRET` (32+ bytes)
- [ ] Secrets in secret manager, not env files
- [ ] Client secrets not exposed to browsers
- [ ] PKCE enabled for all SPAs

### Access Control

- [ ] MFA required for admin accounts
- [ ] Redirect URIs are exact-match (no wildcards)
- [ ] No dangling DNS records for redirect URI domains

### Monitoring

- [ ] Logging enabled for security events
- [ ] Rate limiting on auth endpoints
- [ ] Webhook signatures validated

---

## Ongoing

### Weekly

- [ ] Monitor failed login attempts
- [ ] Review security alerts

### Monthly

- [ ] Review admin access
- [ ] Update dependencies for security patches
- [ ] Test incident response procedures

### Quarterly

- [ ] Audit registered redirect URIs
- [ ] Scan for subdomain takeover vulnerabilities
- [ ] Rotate secrets periodically
- [ ] Review webhook endpoints for security
- [ ] Audit permission changes

---

## Quick Validation Commands

```bash
# Check security headers
curl -I https://your-app.com | grep -i "strict\|security\|frame\|content-type"

# Test SSL/TLS configuration
openssl s_client -connect your-app.com:443 -servername your-app.com

# Scan for subdomain takeover
# Install: go install github.com/haccer/subjack@latest
subjack -w subdomains.txt -t 100 -ssl
```

---

## Related Documentation

- [Authentication Security](./authentication.md)
- [OAuth Security](./oauth.md)
- [Infrastructure Security](./infrastructure.md)
- [Access Control](./access-control.md)
- [Monitoring](./monitoring.md)
