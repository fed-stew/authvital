# Complete SDK Setup Guide

> 🚀 Walk through a **complete integration** of AuthVital into your application.

This guide is split into focused sections for easier navigation. By the end, you'll have:

- ✅ OAuth 2.0 PKCE authentication flow
- ✅ JWT validation and protected routes
- ✅ Permission-based access control
- ✅ Real-time identity sync via webhooks
- ✅ React frontend with auth state management
- ✅ Multi-tenant support

---

## Quick Links

| Guide | Description |
|-------|-------------|
| [Prerequisites & Overview](./prerequisites.md) | Requirements and architecture |
| [Backend Setup](./backend.md) | Express and Next.js integration |
| [Database & Identity Sync](./database.md) | Prisma schema and webhook sync |
| [Frontend Setup](./frontend.md) | React provider and hooks |
| [Common Patterns](./patterns.md) | Permission checks, license gates, multi-tenant |

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           YOUR APPLICATION                                        │
│                                                                                   │
│  ┌─────────────────────┐         ┌─────────────────────┐                         │
│  │     FRONTEND        │         │      BACKEND        │                         │
│  │    (React/Next)     │         │  (Express/Next API) │                         │
│  │                     │         │                     │                         │
│  │  ┌───────────────┐  │  REST   │  ┌───────────────┐  │                         │
│  │  │ AuthVital     │  │ ◄─────► │  │ Auth Routes   │  │                         │
│  │  │ Provider      │  │         │  │ /api/auth/*   │  │                         │
│  │  └───────────────┘  │         │  └───────────────┘  │                         │
│  │         │           │         │         │           │                         │
│  │         ▼           │         │         ▼           │                         │
│  │  ┌───────────────┐  │         │  ┌───────────────┐  │                         │
│  │  │ useAuth()     │  │         │  │ getCurrentUser│  │                         │
│  │  │ Hook          │  │         │  │ JWT Validation│  │                         │
│  │  └───────────────┘  │         │  └───────────────┘  │                         │
│  │                     │         │         │           │                         │
│  └─────────────────────┘         │         ▼           │                         │
│                                  │  ┌───────────────┐  │      ┌────────────────┐ │
│                                  │  │ Webhook       │◄─┼──────│ YOUR DATABASE  │ │
│                                  │  │ Handler       │  │      │ (PostgreSQL)   │ │
│                                  │  └───────────────┘  │      │                │ │
│                                  └─────────────────────┘      │ av_identities  │ │
│                                           ▲                   │ av_sessions    │ │
└───────────────────────────────────────────┼───────────────────┴────────────────┴─┘
                                            │
                    OAuth Flow + Webhooks   │
                                            ▼
                             ┌──────────────────────────┐
                             │      AUTHVITAL IDP       │
                             │                          │
                             │  • User Authentication   │
                             │  • Token Issuance        │
                             │  • JWKS Endpoint         │
                             │  • Webhook Dispatch      │
                             │  • Tenant Management     │
                             │  • License Management    │
                             └──────────────────────────┘
```

---

## Data Flow Summary

| Step | Action | Components |
|------|--------|------------|
| 1️⃣ | User clicks "Sign In" | Frontend → Redirect to AuthVital |
| 2️⃣ | User authenticates at AuthVital | AuthVital IDP |
| 3️⃣ | AuthVital redirects back with code | AuthVital → Your Backend |
| 4️⃣ | Backend exchanges code for tokens | Your Backend → AuthVital |
| 5️⃣ | Backend sets httpOnly cookie | Your Backend → Browser |
| 6️⃣ | Frontend gets user data via API | Frontend → Your Backend |
| 7️⃣ | Webhooks sync identity changes | AuthVital → Your Database |

---

## Next Steps

Start with [Prerequisites & Overview](./prerequisites.md) to understand the requirements and architecture.
