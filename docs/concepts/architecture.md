# Architecture Overview

> Understanding AuthVital's system design and how components interact.

## System Overview

AuthVital is a **B2B Identity Provider** built as a multi-tenant OAuth 2.0/OIDC compliant authentication platform. It provides:

- **Authentication**: OAuth 2.0 with PKCE, password login, SSO
- **Authorization**: Role-based access control (RBAC) with permissions
- **Multi-tenancy**: Complete tenant isolation with membership management
- **Licensing**: Flexible license pool system for SaaS applications
- **Extensibility**: Webhooks and SDK for seamless integration

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Applications"
        SPA[React SPA<br/>@authvital/sdk/client]
        Mobile[Mobile App]
        Server[Backend Server<br/>@authvital/sdk/server]
    end

    subgraph "AuthVital Platform"
        direction TB
        subgraph "API Layer"
            OAuth[OAuth/OIDC<br/>Endpoints]
            Auth[Auth<br/>Controller]
            API[REST API<br/>Controllers]
        end
        
        subgraph "Service Layer"
            AuthSvc[Auth Service]
            OAuthSvc[OAuth Service]
            TenantSvc[Tenant Service]
            LicenseSvc[License Service]
            WebhookSvc[Webhook Service]
        end
        
        subgraph "Data Layer"
            Prisma[Prisma ORM]
            DB[(PostgreSQL)]
        end
        
        subgraph "Security"
            JWT[JWT/JOSE]
            MFA[MFA - TOTP]
            SSO[SSO Providers]
        end
    end

    subgraph "External"
        Google[Google OAuth]
        Microsoft[Microsoft OAuth]
        SendGrid[SendGrid Email]
    end

    SPA -->|OAuth Flow| OAuth
    Mobile -->|OAuth Flow| OAuth
    Server -->|JWT Validation| API
    Server -->|Webhooks| WebhookSvc
    
    OAuth --> OAuthSvc
    Auth --> AuthSvc
    API --> TenantSvc
    API --> LicenseSvc
    
    AuthSvc --> Prisma
    OAuthSvc --> JWT
    TenantSvc --> Prisma
    LicenseSvc --> Prisma
    WebhookSvc --> Prisma
    
    Prisma --> DB
    
    SSO --> Google
    SSO --> Microsoft
    AuthSvc --> SendGrid
```

## Core Components

### 1. OAuth/OIDC Server

The heart of AuthVital - a fully compliant OAuth 2.0 and OpenID Connect server.

| Endpoint | Purpose |
|----------|--------|
| `GET /oauth/authorize` | Start authorization flow |
| `POST /oauth/token` | Exchange code for tokens |
| `GET /oauth/userinfo` | Get user profile (OIDC) |
| `GET /.well-known/openid-configuration` | OIDC discovery |
| `GET /.well-known/jwks.json` | Public signing keys |

**Key Features:**
- PKCE (Proof Key for Code Exchange) for SPAs
- Refresh token rotation
- Tenant-scoped tokens
- Automatic key rotation

### 2. Multi-Tenant Data Model

```mermaid
erDiagram
    User ||--o{ Membership : "belongs to"
    Tenant ||--o{ Membership : "has"
    Membership ||--o{ MembershipRole : "has"
    Role ||--o{ MembershipRole : "assigned via"
    Role ||--o{ RolePermission : "grants"
    Permission ||--o{ RolePermission : "granted by"
    
    User {
        string id PK
        string email UK
        string passwordHash
        boolean mfaEnabled
    }
    
    Tenant {
        string id PK
        string name
        string slug UK
        enum mfaPolicy
    }
    
    Membership {
        string id PK
        string userId FK
        string tenantId FK
        enum status
    }
    
    Role {
        string id PK
        string slug
        string applicationId FK
    }
```

### 3. Licensing Engine

AuthVital includes a sophisticated license pool system for SaaS applications:

```mermaid
graph LR
    subgraph "License Pool System"
        App[Application]
        LT[License Types<br/>Pro, Enterprise, etc.]
        Sub[Subscriptions<br/>Tenant purchases]
        Assign[Assignments<br/>User licenses]
    end
    
    App -->|defines| LT
    LT -->|creates| Sub
    Sub -->|enables| Assign
    
    subgraph "Modes"
        Free[FREE<br/>Auto-provision all]
        Seat[PER_SEAT<br/>Assign individually]
        Wide[TENANT_WIDE<br/>All members access]
    end
```

**Licensing Modes:**

| Mode | Description | Use Case |
|------|-------------|----------|
| `FREE` | All users get access automatically | Free tier, open products |
| `PER_SEAT` | Each user needs an assigned seat | Traditional SaaS licensing |
| `TENANT_WIDE` | Tenant subscribes, all members access | Team/org subscriptions |

### 4. Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client App
    participant A as AuthVital
    participant DB as Database

    U->>C: Click "Login"
    C->>A: GET /oauth/authorize<br/>(client_id, redirect_uri, PKCE)
    A->>U: Show Login Form
    U->>A: Submit credentials
    
    alt MFA Enabled
        A->>U: Show MFA Challenge
        U->>A: Submit TOTP code
    end
    
    A->>DB: Validate & Create Session
    A->>C: Redirect with auth code
    C->>A: POST /oauth/token<br/>(code, PKCE verifier)
    A->>A: Validate PKCE
    A->>C: Return tokens<br/>(access_token, refresh_token, id_token)
    C->>A: GET /api/resource<br/>(Bearer token)
    A->>C: Protected resource
```

### 5. Webhook System

Real-time event notifications for integrating with your systems:

```mermaid
graph LR
    subgraph "AuthVital"
        Event[Event Triggered]
        Queue[Event Queue]
        Deliver[Delivery System]
    end
    
    subgraph "Your App"
        Endpoint[Webhook Endpoint]
        Handler[Event Handler]
        DB[(Your Database)]
    end
    
    Event --> Queue
    Queue --> Deliver
    Deliver -->|POST + HMAC| Endpoint
    Endpoint --> Handler
    Handler --> DB
```

**Event Categories:**
- `subject.*` - User lifecycle (created, updated, deleted)
- `member.*` - Membership changes (joined, left, role_changed)
- `invite.*` - Invitation lifecycle
- `license.*` - License assignments
- `app_access.*` - Application access changes

## Directory Structure

```
authvital/
├── backend/                    # NestJS API Server
│   ├── src/
│   │   ├── auth/              # Authentication (login, register, MFA)
│   │   ├── oauth/             # OAuth 2.0/OIDC endpoints
│   │   ├── tenants/           # Tenant & membership management
│   │   ├── licensing/         # License pool system
│   │   ├── authorization/     # RBAC engine
│   │   ├── sso/               # SSO providers (Google, Microsoft)
│   │   ├── webhooks/          # System webhook delivery
│   │   ├── super-admin/       # Instance administration
│   │   └── prisma/            # Database service
│   ├── prisma/
│   │   ├── schema.prisma      # Data model (53KB!)
│   │   └── migrations/        # Database migrations
│   └── sdk/                   # @authvital/sdk package
│       └── src/
│           ├── client/        # React SDK
│           ├── server/        # Node.js SDK
│           ├── sync/          # User sync utilities
│           └── webhooks/      # Webhook handlers
├── frontend/                  # React Admin Panel
│   └── src/
│       ├── pages/
│       │   ├── admin/         # Super admin UI
│       │   ├── auth/          # Auth flows UI
│       │   └── tenant/        # Tenant admin UI
│       └── components/
└── docker-compose.yml         # Local development
```

## Security Architecture

### Token Security

| Token Type | Lifetime | Storage | Purpose |
|------------|----------|---------|--------|
| Access Token | 1 hour | Memory | API authorization |
| Refresh Token | 7 days | HttpOnly cookie | Token renewal |
| ID Token | 1 hour | Memory | User identity (OIDC) |
| Auth Code | 10 min | Server only | OAuth exchange |

### Key Management

- **JWT Signing Keys**: Ed25519 key pairs, automatically rotated every 7 days
- **Master Secret** (`MASTER_SECRET` env var): Root-of-trust key that encrypts the Ed25519 private keys at rest in the database, derives HMAC keys for cookies/CSRF/auth codes, and encrypts sensitive data like OAuth client secrets
- **JWKS Endpoint**: Public keys available at `/.well-known/jwks.json` — clients validate JWTs against these
- **Two-Layer Architecture**: JWTs are signed by the rotating Ed25519 keys, NOT by the master secret directly. Changing `MASTER_SECRET` invalidates everything because the stored signing keys can no longer be decrypted

### MFA Implementation

```mermaid
graph TD
    Login[Login Request] --> Check{MFA Enabled?}
    Check -->|No| Token[Issue Tokens]
    Check -->|Yes| Challenge[Return MFA Challenge]
    Challenge --> TOTP[User enters TOTP]
    TOTP --> Verify{Valid?}
    Verify -->|Yes| Token
    Verify -->|No| Retry[Retry or Backup Code]
    Retry --> TOTP
```

## Scalability Considerations

### Stateless Design

- JWT tokens are self-contained (no session lookup)
- Horizontal scaling supported
- Database is the only stateful component

### Caching Points

| Data | Cache Strategy |
|------|---------------|
| JWKS | Client-side caching (Cache-Control) |
| User Sessions | Database with indexes |
| Tenant Config | Application-level cache |

### Database Indexes

Key indexes for performance:
- `users.email` - Login lookups
- `sessions.token` - Session validation
- `refresh_tokens.id` - Token ghosting
- `memberships(user_id, tenant_id)` - Membership checks

## Integration Patterns

### Pattern 1: Full SDK Integration

Best for new applications:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ React App   │────▶│ Your API    │────▶│ AuthVital   │
│ (SDK/Client)│     │ (SDK/Server)│     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Pattern 2: Direct OAuth

For custom implementations:

```
┌─────────────┐     ┌─────────────┐
│ Any Client  │────▶│ AuthVital   │
│ (OAuth lib) │     │ OAuth API   │
└─────────────┘     └─────────────┘
```

### Pattern 3: Webhook Sync

For keeping local user data:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ AuthVital   │────▶│ Your API    │────▶│ Your DB     │
│ (Webhooks)  │     │ (Handler)   │     │ (Users)     │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## Next Steps

- [Multi-Tenancy Deep Dive](./multi-tenancy.md)
- [OAuth Flow Details](./oauth-flow.md)
- [Licensing System](./licensing.md)
- [SDK Integration](../sdk/server-sdk/index.md)
