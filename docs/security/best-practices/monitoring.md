# Logging & Monitoring

> Security event logging, rate limiting, and alerting.

## Security Events to Log

| Event | Priority | Action |
|-------|----------|--------|
| Failed login attempts | High | Alert after N failures |
| Password changes | Medium | Notify user |
| MFA changes | High | Notify user |
| Admin actions | High | Audit log |
| Permission changes | Medium | Audit log |
| Token revocations | Medium | Log with context |

---

## Example: Login Logging

AuthVital uses the OAuth redirect flow — login completes at your OAuth callback,
not a password endpoint. Log success/failure there:

```typescript
import { OAuthFlow } from '@authvital/server';

const oauth = new OAuthFlow({
  authVitalHost: process.env.AV_HOST!,
  clientId: process.env.AV_CLIENT_ID!,
  clientSecret: process.env.AV_CLIENT_SECRET!,
  redirectUri: process.env.AV_REDIRECT_URI!,
});

app.get('/auth/callback', async (req, res) => {
  try {
    const tokens = await oauth.handleCallback(
      req.query.code as string,
      req.query.state as string,
      req.cookies.oauth_state,        // stored during startFlow()
      req.cookies.oauth_code_verifier // stored during startFlow()
    );

    logger.info('Successful login', {
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 3600000,
    });
    res.redirect(tokens.appState ?? '/');
  } catch (error) {
    // Log failed attempt
    logger.warn('Failed login attempt', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(401).json({ error: 'Authentication failed' });
  }
});
```

---

## Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// ✅ Rate limit auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
```

---

## Alerting

```typescript
// Alert on suspicious patterns
const ALERT_THRESHOLDS = {
  failedLoginsPerHour: 10,
  passwordResetsPerDay: 3,
  newDevicesPerWeek: 5,
};

async function checkSecurityAlerts(userId: string) {
  const failedLogins = await getFailedLoginCount(userId, '1 hour');
  
  if (failedLogins > ALERT_THRESHOLDS.failedLoginsPerHour) {
    await notifySecurityTeam('Possible brute force', { userId, failedLogins });
    await lockAccount(userId);
  }
}
```

---

## Recommended Monitoring Tools

- **Log Aggregation**: Datadog, Splunk, ELK Stack, Papertrail
- **Alerting**: PagerDuty, Opsgenie, Slack integrations
- **APM**: Datadog APM, New Relic, Sentry
- **Security-specific**: Snyk, Detectify

---

## Related Documentation

- [Authentication Security](./authentication.md)
- [Access Control](./access-control.md)
- [Security Checklist](./checklist.md)
