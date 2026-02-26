# Tenant API Reference

> REST API endpoints for tenant management.

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tenants` | GET | List user's tenants |
| `/api/tenants` | POST | Create tenant |
| `/api/tenants/:id` | GET | Get tenant details |
| `/api/tenants/:id` | PATCH | Update tenant |
| `/api/tenants/:id` | DELETE | Delete tenant |
| `/api/tenants/:id/members` | GET | List members |
| `/api/tenants/:id/invitations` | GET | List invitations |
| `/api/tenants/:id/invitations` | POST | Send invitation |

---

## List User's Tenants

### GET /api/tenants

Get tenants the current user is a member of.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**

```json
{
  "tenants": [
    {
      "id": "tenant-uuid",
      "name": "Acme Corporation",
      "slug": "acme-corp",
      "role": "owner",
      "memberCount": 15,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## Create Tenant

### POST /api/tenants

Create a new tenant. User becomes owner.

**Request:**

```json
{
  "name": "My Company",
  "slug": "my-company"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `slug` | string | No | URL-safe identifier (auto-generated if omitted) |

**Response (201 Created):**

```json
{
  "id": "tenant-uuid",
  "name": "My Company",
  "slug": "my-company",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 409 | `SLUG_TAKEN` | Slug already in use |
| 422 | `VALIDATION_FAILED` | Invalid name or slug format |

---

## Get Tenant Details

### GET /api/tenants/:id

Get details for a specific tenant.

**Response (200 OK):**

```json
{
  "id": "tenant-uuid",
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "settings": {},
  "mfaPolicy": "OPTIONAL",
  "memberCount": 15,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-20T15:45:00Z"
}
```

---

## Update Tenant

### PATCH /api/tenants/:id

Update tenant settings. Requires admin/owner role.

**Request:**

```json
{
  "name": "Acme Corporation Inc.",
  "settings": {
    "timezone": "America/New_York"
  },
  "mfaPolicy": "REQUIRED"
}
```

**Response (200 OK):**

```json
{
  "id": "tenant-uuid",
  "name": "Acme Corporation Inc.",
  "slug": "acme-corp",
  "settings": {
    "timezone": "America/New_York"
  },
  "mfaPolicy": "REQUIRED",
  "updatedAt": "2024-01-20T16:00:00Z"
}
```

---

## Delete Tenant

### DELETE /api/tenants/:id

Delete a tenant. **Requires owner role.**

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Tenant deleted"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 403 | `OWNER_REQUIRED` | Only owner can delete |

---

## List Members

### GET /api/tenants/:id/members

List all tenant members.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | all | Filter: `ACTIVE`, `INVITED`, `SUSPENDED` |
| `role` | string | all | Filter by role |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page |

**Response (200 OK):**

```json
{
  "members": [
    {
      "id": "membership-uuid",
      "userId": "user-uuid",
      "status": "ACTIVE",
      "role": "owner",
      "joinedAt": "2024-01-15T10:30:00Z",
      "user": {
        "email": "owner@example.com",
        "displayName": "Jane Smith",
        "pictureUrl": "https://..."
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "pages": 1
  }
}
```

---

## Update Member

### PATCH /api/tenants/:id/members/:membershipId

Update a member's role or status.

**Request:**

```json
{
  "role": "admin"
}
```

**Response (200 OK):**

```json
{
  "id": "membership-uuid",
  "userId": "user-uuid",
  "status": "ACTIVE",
  "role": "admin",
  "updatedAt": "2024-01-20T16:00:00Z"
}
```

---

## Remove Member

### DELETE /api/tenants/:id/members/:membershipId

Remove a member from the tenant.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Member removed"
}
```

---

## List Invitations

### GET /api/tenants/:id/invitations

List pending invitations.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | `PENDING` | Filter by status |

**Response (200 OK):**

```json
{
  "invitations": [
    {
      "id": "invitation-uuid",
      "email": "newuser@example.com",
      "role": "member",
      "status": "PENDING",
      "expiresAt": "2024-01-22T10:30:00Z",
      "createdAt": "2024-01-15T10:30:00Z",
      "invitedBy": {
        "id": "user-uuid",
        "displayName": "Jane Smith"
      }
    }
  ]
}
```

---

## Send Invitation

### POST /api/tenants/:id/invitations

Invite someone to join the tenant.

**Request:**

```json
{
  "email": "newuser@example.com",
  "role": "member",
  "expiresInDays": 7
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email to invite |
| `role` | string | No | Role to assign (default: `member`) |
| `expiresInDays` | number | No | Days until expiration (default: 7) |

**Response (201 Created):**

```json
{
  "id": "invitation-uuid",
  "email": "newuser@example.com",
  "role": "member",
  "status": "PENDING",
  "expiresAt": "2024-01-22T10:30:00Z"
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 409 | `ALREADY_MEMBER` | User already a member |
| 409 | `INVITATION_EXISTS` | Pending invitation exists |

---

## Resend Invitation

### POST /api/tenants/:id/invitations/:invitationId/resend

Resend invitation email.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Invitation resent"
}
```

---

## Revoke Invitation

### DELETE /api/tenants/:id/invitations/:invitationId

Cancel a pending invitation.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Invitation revoked"
}
```

---

## Accept Invitation

### POST /api/invitations/:token/accept

Accept an invitation (user endpoint).

**Request (for new users):**

```json
{
  "password": "securePassword123",
  "givenName": "John",
  "familyName": "Doe"
}
```

**Request (for existing users):**

```json
{}
```

Requires authentication for existing users.

**Response (200 OK):**

```json
{
  "success": true,
  "tenantId": "tenant-uuid",
  "tenantName": "Acme Corporation"
}
```

---

## Code Examples

### JavaScript

```javascript
// List my tenants
const response = await fetch('/api/tenants', {
  headers: { Authorization: `Bearer ${token}` },
});
const { tenants } = await response.json();

// Create tenant
const createResponse = await fetch('/api/tenants', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'My Company',
    slug: 'my-company',
  }),
});

// Invite member
const inviteResponse = await fetch(`/api/tenants/${tenantId}/invitations`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'colleague@example.com',
    role: 'admin',
  }),
});
```

### cURL

```bash
# List tenants
curl https://auth.example.com/api/tenants \
  -H "Authorization: Bearer eyJ..."

# Create tenant
curl -X POST https://auth.example.com/api/tenants \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"name":"My Company"}'

# Invite member
curl -X POST https://auth.example.com/api/tenants/tenant-id/invitations \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","role":"member"}'
```

---

## Related Documentation

- [Multi-Tenancy](../concepts/multi-tenancy.md)
- [Tenant Admin Guide](../admin/tenant-admin.md)
- [Access Control](../concepts/access-control.md)
