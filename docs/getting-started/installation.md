# Installation & Deployment

> Set up AuthVital for local development or production deployment.

## Prerequisites

- **Node.js** 18 or later
- **PostgreSQL** 13 or later
- **Docker** (optional, for containerized deployment)

## Local Development

### Option 1: Docker Compose (Recommended)

The fastest way to get AuthVital running locally:

```bash
# Clone the repository
git clone https://github.com/your-org/authvital.git
cd authvital

# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env

# Start all services
docker-compose up -d
```

This starts:
- **PostgreSQL** on port 5432
- **AuthVital Backend** on port 8000
- **AuthVital Frontend** on port 5173 (dev mode)

Access the admin panel at: `http://localhost:8000/admin`

### Option 2: Manual Setup

#### 1. Set Up PostgreSQL

```bash
# macOS with Homebrew
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb authvital
```

Or use Docker for just the database:

!!! warning "⚠️ Quick Start Values - Replace for Production"
    The examples below use `localdev123` as a placeholder password for quick local testing.
    
    **Before deploying to production:**
    
    - Generate a secure database password: `openssl rand -base64 32`
    - Generate a secure signing key: `openssl rand -hex 32`
    - Store secrets in a secret manager (not in code or .env files)

```bash
docker run -d \
  --name authvital-db \
  -e POSTGRES_USER=authvital \
  -e POSTGRES_PASSWORD=localdev123 \
  -e POSTGRES_DB=authvital \
  -p 5432:5432 \
  postgres:15
```

#### 2. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```bash
# Database
DATABASE_URL=postgresql://authvital:localdev123@localhost:5432/authvital

# Application
BASE_URL=http://localhost:8000
PORT=8000
NODE_ENV=development

# Security (generate a new one!)
SIGNING_KEY_SECRET=your-32-byte-hex-string-here

# Cookie (false for local HTTP)
COOKIE_SECURE=false

# Super Admin (created on first run)
SUPER_ADMIN_EMAIL=admin@localhost
```

Generate a secure signing key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 3. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend (optional, for local UI development)
cd ../frontend
npm install
```

#### 4. Run Migrations

```bash
cd backend
npx prisma migrate dev
```

#### 5. Start Development Server

```bash
# Backend only
npm run start:dev

# Or run backend + frontend together
# Terminal 1:
cd backend && npm run start:dev

# Terminal 2:
cd frontend && npm run dev
```

## Production Deployment

### Cloud Run (Google Cloud)

AuthVital is designed for Cloud Run with a **two-mode deployment pattern**:

```
┌─────────────────────────────────────────────────────────────────┐
│ CI/CD Pipeline                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Build Docker Image                                          │
│     └─> Push to Artifact Registry                               │
│                                                                  │
│  2. Deploy Migration Job                                        │
│     └─> Cloud Run Job (runs migrations)                         │
│                                                                  │
│  3. Execute Migration Job                                       │
│     └─> Wait for completion                                     │
│                                                                  │
│  4. Deploy API Service                                          │
│     └─> Cloud Run Service (fast startup!)                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 1. Build and Push Image

```bash
# Build the image
docker build -t gcr.io/PROJECT_ID/authvital:latest ./backend

# Push to Artifact Registry
docker push gcr.io/PROJECT_ID/authvital:latest
```

#### 2. Create Cloud SQL Database

```bash
gcloud sql instances create authvital-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

gcloud sql databases create authvital \
  --instance=authvital-db
```

#### 3. Set Up Secrets

```bash
# Database password
echo -n "your-db-password" | gcloud secrets create DB_PASSWORD --data-file=-

# Signing key
echo -n "$(openssl rand -hex 32)" | gcloud secrets create SIGNING_KEY_SECRET --data-file=-

# SendGrid API key (for emails)
echo -n "SG.xxx" | gcloud secrets create SENDGRID_API_KEY --data-file=-
```

#### 4. Deploy Migration Job

```bash
gcloud run jobs create authvital-migration \
  --image=gcr.io/PROJECT_ID/authvital:latest \
  --command="./migrate.sh" \
  --set-cloudsql-instances=PROJECT_ID:REGION:authvital-db \
  --set-secrets=DB_PASSWORD=DB_PASSWORD:latest,SIGNING_KEY_SECRET=SIGNING_KEY_SECRET:latest \
  --set-env-vars="DB_HOST=/cloudsql/PROJECT_ID:REGION:authvital-db,DB_USERNAME=postgres,DB_DATABASE=authvital,BASE_URL=https://auth.yourdomain.com"
```

#### 5. Run Migrations

```bash
gcloud run jobs execute authvital-migration --wait
```

#### 6. Deploy API Service

```bash
gcloud run deploy authvital \
  --image=gcr.io/PROJECT_ID/authvital:latest \
  --set-cloudsql-instances=PROJECT_ID:REGION:authvital-db \
  --set-secrets=DB_PASSWORD=DB_PASSWORD:latest,SIGNING_KEY_SECRET=SIGNING_KEY_SECRET:latest \
  --set-env-vars="DB_HOST=/cloudsql/PROJECT_ID:REGION:authvital-db,DB_USERNAME=postgres,DB_DATABASE=authvital,BASE_URL=https://auth.yourdomain.com,NODE_ENV=production" \
  --allow-unauthenticated \
  --port=8000
```

### Kubernetes / Helm

```yaml
# values.yaml
image:
  repository: gcr.io/PROJECT_ID/authvital
  tag: latest

env:
  BASE_URL: https://auth.yourdomain.com
  NODE_ENV: production
  COOKIE_SECURE: "true"

secrets:
  - name: DATABASE_URL
    secretRef: authvital-secrets
    key: database-url
  - name: SIGNING_KEY_SECRET
    secretRef: authvital-secrets
    key: signing-key

postgresql:
  enabled: true  # Or use external database
```

### Docker (Self-hosted)

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: authvital
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: authvital
    volumes:
      - postgres_data:/var/lib/postgresql/data

  app:
    image: gcr.io/PROJECT_ID/authvital:latest
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://authvital:${DB_PASSWORD}@db:5432/authvital
      BASE_URL: https://auth.yourdomain.com
      NODE_ENV: production
      COOKIE_SECURE: "true"
      SIGNING_KEY_SECRET: ${SIGNING_KEY_SECRET}
    depends_on:
      - db

volumes:
  postgres_data:
```

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|--------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `BASE_URL` | Public URL of AuthVital | `https://auth.yourdomain.com` |
| `SIGNING_KEY_SECRET` | 32-byte hex key for JWT signing | `0123456789abcdef...` (64 chars) |

### Optional

| Variable | Description | Default |
|----------|-------------|--------|
| `PORT` | Server port | `8000` |
| `NODE_ENV` | Environment | `development` |
| `COOKIE_SECURE` | Secure cookie flag | `true` in production |
| `CORS_ORIGINS` | Additional CORS origins | (none) |
| `SENDGRID_API_KEY` | SendGrid API key | (logs emails to console) |
| `SENDGRID_FROM_EMAIL` | From address for emails | `noreply@yourdomain.com` |
| `SUPER_ADMIN_EMAIL` | Initial super admin email | (no auto-create) |
| `KEY_ROTATION_INTERVAL_SECONDS` | JWT key rotation interval | `604800` (7 days) |

### Cloud SQL (GCP)

When using Cloud SQL, configure these instead of `DATABASE_URL`:

| Variable | Description |
|----------|-------------|
| `DB_HOST` | Cloud SQL socket path |
| `DB_USERNAME` | Database username |
| `DB_PASSWORD` | Database password (from Secret Manager) |
| `DB_DATABASE` | Database name |

## First Login

After deployment:

1. Navigate to `https://auth.yourdomain.com/admin`
2. If `SUPER_ADMIN_EMAIL` was set, check email for password reset link
3. Or use the default credentials (development only)
4. **Immediately change the password and enable MFA**

## Health Checks

AuthVital exposes a health endpoint:

```bash
curl https://auth.yourdomain.com/health
# {"status":"ok","timestamp":"2024-01-15T..."}
```

For Kubernetes/Cloud Run:

```yaml
# Liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 30

# Readiness probe
readinessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Troubleshooting

### Database Connection Failed

```
Error: Can't reach database server at `localhost`:`5432`
```

1. Ensure PostgreSQL is running
2. Check `DATABASE_URL` is correct
3. Verify network connectivity (especially in containers)

### Migration Failed

```
Error: P3009 migrate found failed migrations
```

```bash
# Reset failed migration (development only!)
npx prisma migrate reset

# Or resolve manually
npx prisma migrate resolve --rolled-back MIGRATION_NAME
```

### Token Validation Failed

1. Ensure `BASE_URL` matches the issuer in JWTs
2. Verify `SIGNING_KEY_SECRET` is the same across all instances
3. Check token hasn't expired

### CORS Errors

Add your frontend origin to `CORS_ORIGINS`:

```bash
CORS_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com
```

---

## Related Documentation

- [Configuration Reference](./configuration.md)
- [Architecture Overview](../concepts/architecture.md)
- [Quick Start Guide](./quick-start.md)
