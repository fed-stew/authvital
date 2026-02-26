# User API Reference

> REST API endpoints for user management.

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users/me` | GET | Get current user profile |
| `/api/users/me` | PATCH | Update current user profile |
| `/api/users/me/password` | POST | Change password |
| `/api/users/me/sessions` | GET | List active sessions |
| `/api/users/me/sessions/:id` | DELETE | Revoke session |
| `/api/users/me/sso` | GET | List SSO links |
| `/api/users/me/sso/:provider` | DELETE | Unlink SSO provider |

---

## Get Current User

### GET /api/users/me

Get the authenticated user's profile.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**

```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "emailVerified": true,
  "username": "janesmith",
  "displayName": "Jane Smith",
  "givenName": "Jane",
  "familyName": "Smith",
  "middleName": null,
  "nickname": "Janey",
  "pictureUrl": "https://...",
  "website": "https://janesmith.com",
  "gender": null,
  "birthdate": null,
  "zoneinfo": "America/Los_Angeles",
  "locale": "en-US",
  "phone": "+1234567890",
  "phoneVerified": false,
  "mfaEnabled": true,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-20T15:45:00Z",
  "memberships": [
    {
      "tenantId": "tenant-uuid",
      "tenantName": "Acme Corp",
      "tenantSlug": "acme-corp",
      "role": "admin",
      "status": "ACTIVE"
    }
  ]
}
```

---

## Update Profile

### PATCH /api/users/me

Update the current user's profile.

**Request:**

```json
{
  "displayName": "Jane Marie Smith",
  "givenName": "Jane",
  "familyName": "Smith",
  "middleName": "Marie",
  "nickname": "JM",
  "pictureUrl": "https://...",
  "website": "https://janesmith.dev",
  "zoneinfo": "America/New_York",
  "locale": "en-US"
}
```

**Updatable Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | string | Full display name |
| `givenName` | string | First name |
| `familyName` | string | Last name |
| `middleName` | string | Middle name |
| `nickname` | string | Preferred nickname |
| `pictureUrl` | string | Profile picture URL |
| `website` | string | Personal website |
| `zoneinfo` | string | IANA timezone |
| `locale` | string | Language preference |

**Response (200 OK):**

```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "displayName": "Jane Marie Smith",
  "givenName": "Jane",
  "familyName": "Smith",
  "middleName": "Marie",
  "updatedAt": "2024-01-20T16:00:00Z"
}
```

---

## Change Password

### POST /api/users/me/password

Change the current user's password.

**Request:**

```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword456"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `currentPassword` | string | Yes | Current password |
| `newPassword` | string | Yes | New password (min 8 chars) |

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `CURRENT_PASSWORD_INCORRECT` | Wrong current password |
| 422 | `WEAK_PASSWORD` | New password too weak |
| 422 | `SAME_PASSWORD` | New password same as current |

---

## List Active Sessions

### GET /api/users/me/sessions

List all active sessions for the current user.

**Response (200 OK):**

```json
{
  "sessions": [
    {
      "id": "session-uuid",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
      "ipAddress": "192.168.1.1",
      "location": "San Francisco, CA, US",
      "lastActive": "2024-01-20T15:45:00Z",
      "createdAt": "2024-01-15T10:30:00Z",
      "isCurrent": true
    },
    {
      "id": "session-uuid-2",
      "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...",
      "ipAddress": "192.168.1.2",
      "location": "San Francisco, CA, US",
      "lastActive": "2024-01-19T08:00:00Z",
      "createdAt": "2024-01-18T12:00:00Z",
      "isCurrent": false
    }
  ]
}
```

---

## Revoke Session

### DELETE /api/users/me/sessions/:sessionId

Revoke a specific session (log out that device).

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Session revoked"
}
```

---

## Revoke All Sessions

### DELETE /api/users/me/sessions

Revoke all sessions except current.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "All other sessions revoked",
  "count": 3
}
```

---

## List SSO Links

### GET /api/users/me/sso

List SSO providers linked to account.

**Response (200 OK):**

```json
{
  "links": [
    {
      "provider": "GOOGLE",
      "email": "jane.smith@gmail.com",
      "displayName": "Jane Smith",
      "avatarUrl": "https://...",
      "linkedAt": "2024-01-15T10:30:00Z",
      "lastUsedAt": "2024-01-20T08:00:00Z"
    }
  ]
}
```

---

## Initiate SSO Link

### POST /api/users/me/sso/link

Start linking an SSO provider.

**Request:**

```json
{
  "provider": "MICROSOFT",
  "redirectUri": "https://app.example.com/settings/account"
}
```

**Response (200 OK):**

```json
{
  "url": "https://auth.example.com/sso/microsoft?state=..."
}
```

Redirect user to `url` to complete OAuth flow.

---

## Unlink SSO Provider

### DELETE /api/users/me/sso/:provider

Unlink an SSO provider from account.

**Note:** User must have a password set to unlink SSO.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Google account unlinked"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `PASSWORD_REQUIRED` | Must set password before unlinking |
| 400 | `LAST_LOGIN_METHOD` | Can't remove only login method |

---

## Update Email

### POST /api/users/me/email

Request email change (sends verification to new email).

**Request:**

```json
{
  "newEmail": "newemail@example.com",
  "password": "currentPassword123"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Verification email sent to new address"
}
```

After user clicks link in email, email is updated.

---

## Delete Account

### DELETE /api/users/me

Delete the current user's account.

**Request:**

```json
{
  "password": "currentPassword123",
  "confirmation": "DELETE MY ACCOUNT"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Account scheduled for deletion"
}
```

**Note:** Account may have a grace period before permanent deletion.

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `TENANT_OWNER` | Must transfer ownership first |
| 400 | `INCORRECT_CONFIRMATION` | Confirmation text doesn't match |

---

## Code Examples

### JavaScript

```javascript
// Get current user
const userResponse = await fetch('/api/users/me', {
  headers: { Authorization: `Bearer ${token}` },
});
const user = await userResponse.json();

// Update profile
const updateResponse = await fetch('/api/users/me', {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    displayName: 'Jane Marie Smith',
    zoneinfo: 'America/New_York',
  }),
});

// Change password
const passwordResponse = await fetch('/api/users/me/password', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    currentPassword: 'oldPassword',
    newPassword: 'newSecurePassword',
  }),
});

// List and revoke sessions
const sessions = await fetch('/api/users/me/sessions', {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json());

// Revoke other session
await fetch(`/api/users/me/sessions/${sessionId}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${token}` },
});
```

### cURL

```bash
# Get current user
curl https://auth.example.com/api/users/me \
  -H "Authorization: Bearer eyJ..."

# Update profile
curl -X PATCH https://auth.example.com/api/users/me \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Jane Smith"}'

# Change password
curl -X POST https://auth.example.com/api/users/me/password \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"old","newPassword":"new"}'

# List sessions
curl https://auth.example.com/api/users/me/sessions \
  -H "Authorization: Bearer eyJ..."
```

---

## Related Documentation

- [Authentication API](./authentication.md)
- [Server SDK](../sdk/server-sdk.md)
- [Security Best Practices](../security/best-practices.md)
