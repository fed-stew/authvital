# Error Codes Reference

> Complete reference for AuthVital error codes and their resolution.

## HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Invalid parameters, malformed request |
| 401 | Unauthorized | Missing/invalid/expired token |
| 403 | Forbidden | Valid auth but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, state conflict |
| 422 | Unprocessable | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server-side error |

## OAuth Errors

### Authorization Endpoint Errors

Returned as query params on redirect: `?error=xxx&error_description=xxx`

| Error | Description | Resolution |
|-------|-------------|------------|
| `invalid_request` | Missing required parameter | Check all required OAuth params are present |
| `unauthorized_client` | Client not authorized | Verify client_id is correct |
| `access_denied` | User denied authorization | User cancelled - show friendly message |
| `unsupported_response_type` | response_type not supported | Use `response_type=code` |
| `invalid_scope` | Requested scope is invalid | Check scope values |
| `server_error` | Server error | Retry, check AuthVital logs |

### Token Endpoint Errors

Returned as JSON: `{ "error": "xxx", "error_description": "xxx" }`

| Error | Description | Resolution |
|-------|-------------|------------|
| `invalid_request` | Malformed request | Check Content-Type, params |
| `invalid_client` | Client auth failed | Verify client_id and client_secret |
| `invalid_grant` | Invalid authorization code | Code expired, already used, or PKCE mismatch |
| `unauthorized_client` | Grant type not allowed | Check client type supports this grant |
| `unsupported_grant_type` | Grant type not supported | Use supported grant_type |
| `invalid_scope` | Scope invalid | Check scope values |

#### Common `invalid_grant` Causes

```typescript
// 1. Code already used
{ error: 'invalid_grant', error_description: 'Authorization code already used' }
// Resolution: Request new auth code

// 2. Code expired (10 min TTL)
{ error: 'invalid_grant', error_description: 'Authorization code expired' }
// Resolution: Request new auth code

// 3. PKCE mismatch
{ error: 'invalid_grant', error_description: 'PKCE verification failed' }
// Resolution: Verify code_verifier matches code_challenge

// 4. Redirect URI mismatch
{ error: 'invalid_grant', error_description: 'Redirect URI mismatch' }
// Resolution: Use exact same redirect_uri as authorize request
```

## Authentication Errors

### Login Errors

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid credentials"
}
```

| Code | Message | Resolution |
|------|---------|------------|
| `INVALID_CREDENTIALS` | Invalid email or password | Check credentials |
| `ACCOUNT_DISABLED` | Account has been disabled | Contact admin |
| `EMAIL_NOT_VERIFIED` | Email address not verified | Complete email verification |
| `MFA_REQUIRED` | MFA verification required | Complete MFA challenge |
| `PASSWORD_EXPIRED` | Password has expired | Reset password |

### MFA Errors

| Code | Message | Resolution |
|------|---------|------------|
| `MFA_CODE_INVALID` | Invalid MFA code | Check code, verify time sync |
| `MFA_CODE_EXPIRED` | MFA code has expired | Wait for new code (30 sec) |
| `MFA_NOT_ENABLED` | MFA not enabled for user | Enable MFA first |
| `BACKUP_CODE_INVALID` | Invalid backup code | Check code, use another |
| `BACKUP_CODE_ALREADY_USED` | Backup code already used | Use a different backup code |
| `MFA_CHALLENGE_EXPIRED` | MFA challenge expired | Re-authenticate |

### Token Errors

| Code | Message | Resolution |
|------|---------|------------|
| `TOKEN_EXPIRED` | Access token has expired | Use refresh token to get new access token |
| `TOKEN_INVALID` | Token is invalid | Re-authenticate |
| `TOKEN_REVOKED` | Token has been revoked | Re-authenticate |
| `REFRESH_TOKEN_EXPIRED` | Refresh token has expired | Re-authenticate from scratch |
| `REFRESH_TOKEN_REVOKED` | Refresh token revoked | Re-authenticate |

## Authorization Errors

### Permission Errors

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Permission denied",
  "required": ["users:write"]
}
```

| Code | Message | Resolution |
|------|---------|------------|
| `PERMISSION_DENIED` | User lacks required permission | Grant permission via role |
| `TENANT_ACCESS_DENIED` | User not member of tenant | Add user to tenant |
| `APP_ACCESS_DENIED` | User lacks app access | Grant app access |
| `LICENSE_REQUIRED` | Feature requires license | Assign license |
| `FEATURE_NOT_AVAILABLE` | Feature not in license | Upgrade license |

### Role Errors

| Code | Message | Resolution |
|------|---------|------------|
| `ROLE_NOT_FOUND` | Role does not exist | Check role ID/slug |
| `INSUFFICIENT_ROLE` | Role lacks privileges | Assign higher role |

## Resource Errors

### User Errors

| Code | Message | Resolution |
|------|---------|------------|
| `USER_NOT_FOUND` | User does not exist | Check user ID |
| `USER_ALREADY_EXISTS` | Email already registered | Use different email or login |
| `USER_DISABLED` | User account is disabled | Contact admin to re-enable |

### Tenant Errors

| Code | Message | Resolution |
|------|---------|------------|
| `TENANT_NOT_FOUND` | Tenant does not exist | Check tenant ID/slug |
| `TENANT_SLUG_TAKEN` | Slug already in use | Choose different slug |
| `MEMBERSHIP_NOT_FOUND` | User not in tenant | Check membership |
| `ALREADY_MEMBER` | User already a member | No action needed |

### Invitation Errors

| Code | Message | Resolution |
|------|---------|------------|
| `INVITATION_NOT_FOUND` | Invitation does not exist | Check invitation ID |
| `INVITATION_EXPIRED` | Invitation has expired | Send new invitation |
| `INVITATION_ALREADY_ACCEPTED` | Already accepted | User is already a member |
| `INVITATION_REVOKED` | Invitation was revoked | Send new invitation |

### Application Errors

| Code | Message | Resolution |
|------|---------|------------|
| `APPLICATION_NOT_FOUND` | Application does not exist | Check application ID/client_id |
| `REDIRECT_URI_NOT_ALLOWED` | Redirect URI not registered | Add URI to application |
| `INVALID_CLIENT_TYPE` | Operation not allowed for type | Check application type |

### Licensing Errors

| Code | Message | Resolution |
|------|---------|------------|
| `LICENSE_TYPE_NOT_FOUND` | License type does not exist | Check license type ID |
| `SUBSCRIPTION_NOT_FOUND` | No subscription found | Create subscription |
| `NO_SEATS_AVAILABLE` | All seats assigned | Purchase more seats |
| `LICENSE_ALREADY_ASSIGNED` | User already has license | No action needed |
| `SUBSCRIPTION_INACTIVE` | Subscription not active | Renew subscription |

## Validation Errors

### Field Validation

```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ]
}
```

### Common Validation Errors

| Field | Error | Resolution |
|-------|-------|------------|
| `email` | Invalid email format | Use valid email address |
| `email` | Email already registered | Use different email |
| `password` | Too short | Use 8+ characters |
| `password` | Too weak | Include uppercase, numbers, symbols |
| `slug` | Invalid format | Use lowercase, numbers, hyphens only |
| `slug` | Already taken | Choose different slug |
| `url` | Invalid URL format | Use valid URL with protocol |

## Webhook Errors

| Code | Message | Resolution |
|------|---------|------------|
| `SIGNATURE_INVALID` | Invalid webhook signature | Verify secret matches |
| `SIGNATURE_MISSING` | Missing signature header | Include X-AuthVital-Signature |
| `PAYLOAD_INVALID` | Invalid JSON payload | Check request body format |

## Rate Limiting

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "retryAfter": 60
}
```

Headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705320000
Retry-After: 60
```

## Error Handling Examples

### JavaScript/TypeScript

```typescript
try {
  const response = await fetch('/api/users', {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!response.ok) {
    const error = await response.json();
    
    switch (response.status) {
      case 401:
        // Token expired - refresh it
        await refreshToken();
        return retry();
        
      case 403:
        // Permission denied
        showError(`Missing permission: ${error.required?.join(', ')}`);
        break;
        
      case 422:
        // Validation errors
        error.errors?.forEach(e => {
          setFieldError(e.field, e.message);
        });
        break;
        
      case 429:
        // Rate limited
        await sleep(error.retryAfter * 1000);
        return retry();
        
      default:
        showError(error.message);
    }
  }
} catch (err) {
  showError('Network error');
}
```

### React Error Boundary

```tsx
function ErrorDisplay({ error }: { error: AuthVitalError }) {
  switch (error.code) {
    case 'TOKEN_EXPIRED':
      return <LoginPrompt message="Your session has expired" />;
      
    case 'PERMISSION_DENIED':
      return <AccessDenied required={error.required} />;
      
    case 'LICENSE_REQUIRED':
      return <UpgradePrompt feature={error.feature} />;
      
    default:
      return <GenericError message={error.message} />;
  }
}
```

---

## Related Documentation

- [OAuth Flow](../concepts/oauth-flow.md)
- [Security Best Practices](../security/best-practices/index.md)
- [Server SDK](../sdk/server-sdk/index.md)
