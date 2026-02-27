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

```typescript
import { createAuthVital } from '@authvital/sdk/server';

const authvital = createAuthVital({ /* config */ });

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await authvital.auth.login({
      email: req.body.email,
      password: req.body.password,
    });
    
    // Handle MFA if required
    if ('mfaRequired' in result && result.mfaRequired) {
      return res.json({ mfaRequired: true, challengeToken: result.mfaChallengeToken });
    }
    
    // Success - log and set cookie
    logger.info('Successful login', {
      userId: result.user.id,
      email: result.user.email,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    
    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 3600000,
    });
    res.json({ user: result.user });
  } catch (error) {
    // Log failed attempt
    logger.warn('Failed login attempt', {
      email: req.body.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(401).json({ error: 'Invalid credentials' });
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
