#!/bin/bash

#######################################################################
# AuthVital GCP Deploy Script
#######################################################################
#
# Idempotent script that provisions GCP infrastructure and deploys
# AuthVital to Cloud Run from a public Docker image.
#
# No Docker build required — AuthVital is published as a public image.
#
# USAGE:
#   ./scripts/deploy-gcp.sh --project <id> --base-url <url>
#   ./scripts/deploy-gcp.sh --project <id> --base-url <url> --region us-east1
#   ./scripts/deploy-gcp.sh --project <id> --base-url <url> --skip-infra
#   ./scripts/deploy-gcp.sh --project <id> --base-url <url> --skip-migrate
#   ./scripts/deploy-gcp.sh -h / --help
#
# EXAMPLES:
#   # Full deploy to a fresh project
#   ./scripts/deploy-gcp.sh --project my-auth-prod --base-url https://auth.example.com
#
#   # Deploy with custom image tag
#   ./scripts/deploy-gcp.sh --project my-auth-prod --base-url https://auth.example.com \
#       --image ghcr.io/authvital/authvital:v1.2.0
#
#   # Re-deploy service only (infra already exists)
#   ./scripts/deploy-gcp.sh --project my-auth-prod --base-url https://auth.example.com \
#       --skip-infra --skip-migrate
#
#   # Re-run safely — everything is idempotent
#   ./scripts/deploy-gcp.sh --project my-auth-prod --base-url https://auth.example.com
#
# PREREQUISITES:
#   - gcloud CLI installed and authenticated
#   - Sufficient IAM permissions on the target GCP project
#
#######################################################################

set -e

#######################################################################
# Colors and Logging Helpers
#######################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_step()   { echo -e "${BLUE}▶${NC} $1"; }
log_info()   { echo -e "${CYAN}ℹ${NC} $1"; }
log_success(){ echo -e "${GREEN}✅${NC} $1"; }
log_warn()   { echo -e "${YELLOW}⚠️${NC} $1"; }
log_error()  { echo -e "${RED}❌${NC} $1"; }
log_header() { echo -e "\n${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${PURPLE}🚀 $1${NC}"; echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"; }

#######################################################################
# Default Options
#######################################################################

GCP_PROJECT=""
REGION="us-central1"
IMAGE="ghcr.io/authvital/authvital:latest"
BASE_URL=""
CLOUDSQL_INSTANCE="authvital-db"
DB_NAME="authvital"
SUPER_ADMIN_EMAIL="admin@localhost.com"
SKIP_INFRA=false
SKIP_MIGRATE=false
ROTATE_DB_PASSWORD=false

#######################################################################
# Parse Arguments
#######################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --project)
            GCP_PROJECT="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --image)
            IMAGE="$2"
            shift 2
            ;;
        --base-url)
            BASE_URL="$2"
            shift 2
            ;;
        --cloudsql-instance)
            CLOUDSQL_INSTANCE="$2"
            shift 2
            ;;
        --db-name)
            DB_NAME="$2"
            shift 2
            ;;
        --super-admin-email)
            SUPER_ADMIN_EMAIL="$2"
            shift 2
            ;;
        --skip-infra)
            SKIP_INFRA=true
            shift
            ;;
        --skip-migrate)
            SKIP_MIGRATE=true
            shift
            ;;
        --rotate-db-password)
            ROTATE_DB_PASSWORD=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 --project <gcp-project-id> --base-url <url> [options]"
            echo ""
            echo "Required:"
            echo "  --project <id>                GCP project ID"
            echo "  --base-url <url>              Public URL for AuthVital (e.g., https://auth.example.com)"
            echo ""
            echo "Options:"
            echo "  --region <r>                  GCP region (default: us-central1)"
            echo "  --image <image>               Docker image (default: ghcr.io/authvital/authvital:latest)"
            echo "  --cloudsql-instance <name>     CloudSQL instance name (default: authvital-db)"
            echo "  --db-name <name>              Database name (default: authvital)"
            echo "  --super-admin-email <email>   Super admin email (default: admin@localhost.com)"
            echo "  --skip-infra                  Skip CloudSQL + Secret Manager creation"
            echo "  --skip-migrate                Skip running the migration job"
            echo "  --rotate-db-password          Force regeneration of the postgres password"
            echo "                                (default: keep the existing secret so running"
            echo "                                services stay in sync until redeployed)"
            echo "  -h, --help                    Show this help message"
            echo ""
            echo "Notes:"
            echo "  The master secret (authvital-master-secret) is generated only on first"
            echo "  run and is NEVER rotated by this script. Rotating it invalidates all"
            echo "  sessions and stored signing keys — treat rotation as a deliberate"
            echo "  manual operation via Secret Manager."
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Run '$0 --help' for usage."
            exit 1
            ;;
    esac
done

# Validate required args
if [[ -z "$GCP_PROJECT" ]]; then
    log_error "--project is required."
    echo "Run '$0 --help' for usage."
    exit 1
fi

if [[ -z "$BASE_URL" ]]; then
    log_error "--base-url is required."
    echo "Run '$0 --help' for usage."
    exit 1
fi

# Strip trailing slash from BASE_URL
BASE_URL="${BASE_URL%/}"

#######################################################################
# Derived Configuration
#######################################################################

CLOUDSQL_CONNECTION="${GCP_PROJECT}:${REGION}:${CLOUDSQL_INSTANCE}"
CLOUDSQL_SOCKET_PATH="/cloudsql/${CLOUDSQL_CONNECTION}"
SERVICE_ACCOUNT_NAME="authvital-runtime"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com"

REQUIRED_APIS=(
    "run.googleapis.com"
    "sqladmin.googleapis.com"
    "secretmanager.googleapis.com"
)

SA_ROLES=(
    "roles/cloudsql.client"
    "roles/secretmanager.secretAccessor"
    "roles/run.invoker"
)

SECRET_DB_PASSWORD="authvital-db-password"
SECRET_MASTER="authvital-master-secret"
SECRET_SENDGRID="authvital-sendgrid-key"

#######################################################################
# Banner
#######################################################################

echo -e "${CYAN}"
cat << 'EOF'
     _         _   _  ___     _ _        _
    / \  _   _| |_| |__ \   (_) |_ __ _| |
   / _ \| | | | __| '_ \ \ / / | __/ _` | |
  / ___ \ |_| | |_| | | \ V /| | || (_| | |
 /_/   \_\__,_|\__|_| |_|\_/ |_|\__\__,_|_|

EOF
echo -e "${NC}"
echo -e "${YELLOW}GCP Cloud Run Deploy Script${NC}"
echo ""

#######################################################################
# Display Configuration
#######################################################################

log_info "Configuration:"
echo -e "   ${CYAN}GCP Project:${NC}          $GCP_PROJECT"
echo -e "   ${CYAN}Region:${NC}               $REGION"
echo -e "   ${CYAN}Image:${NC}                $IMAGE"
echo -e "   ${CYAN}Base URL:${NC}             $BASE_URL"
echo -e "   ${CYAN}CloudSQL Instance:${NC}    $CLOUDSQL_INSTANCE"
echo -e "   ${CYAN}Database:${NC}             $DB_NAME"
echo -e "   ${CYAN}Super Admin Email:${NC}    $SUPER_ADMIN_EMAIL"
echo -e "   ${CYAN}Service Account:${NC}      $SERVICE_ACCOUNT"
echo ""

if [[ "$SKIP_INFRA" == true ]]; then
    log_warn "Mode: SKIP INFRA (assuming CloudSQL + secrets already exist)"
fi
if [[ "$SKIP_MIGRATE" == true ]]; then
    log_warn "Mode: SKIP MIGRATE (will not run migration job)"
fi
if [[ "$SKIP_INFRA" != true && "$SKIP_MIGRATE" != true ]]; then
    log_info "Mode: Full infrastructure + migration + deploy"
fi
echo ""

#######################################################################
# Phase 1: Preflight & API Enablement
#######################################################################

log_header "Phase 1: Preflight & API Enablement"

# Check gcloud
log_step "Checking gcloud CLI..."
if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install"
    exit 1
fi
log_success "gcloud CLI found"

# Check gcloud auth
log_step "Checking gcloud authentication..."
if ! gcloud auth print-access-token &> /dev/null; then
    log_error "Not authenticated with gcloud. Run: gcloud auth login"
    exit 1
fi
ACCOUNT=$(gcloud config get-value account 2>/dev/null)
log_success "Authenticated as: $ACCOUNT"

# Validate project exists
log_step "Validating GCP project '${GCP_PROJECT}'..."
if ! gcloud projects describe "$GCP_PROJECT" &> /dev/null; then
    log_error "GCP project '${GCP_PROJECT}' not found or not accessible."
    log_error "Check the project ID and ensure you have access."
    exit 1
fi
log_success "GCP project '${GCP_PROJECT}' is accessible"

# Set gcloud project context
log_step "Setting gcloud project context..."
gcloud config set project "$GCP_PROJECT" --quiet 2>/dev/null
log_success "Project context set to '${GCP_PROJECT}'"

# Enable required APIs
log_step "Enabling required GCP APIs (this may take a minute)..."
log_info "APIs: ${REQUIRED_APIS[*]}"
gcloud services enable "${REQUIRED_APIS[@]}" --project="$GCP_PROJECT" --quiet
log_success "All required APIs enabled"

#######################################################################
# Phase 2: Infrastructure Setup (all idempotent)
#######################################################################

if [[ "$SKIP_INFRA" == true ]]; then
    log_header "Phase 2: Infrastructure Setup"
    log_warn "Skipping infrastructure setup (--skip-infra)"
else
    log_header "Phase 2: Infrastructure Setup"

    # --- CloudSQL Instance ---
    log_step "Setting up CloudSQL instance '${CLOUDSQL_INSTANCE}'..."
    if gcloud sql instances describe "$CLOUDSQL_INSTANCE" \
        --project="$GCP_PROJECT" &> /dev/null 2>&1; then
        log_success "CloudSQL instance '${CLOUDSQL_INSTANCE}' already exists"
    else
        log_info "Creating CloudSQL PostgreSQL 16 instance '${CLOUDSQL_INSTANCE}'..."
        log_info "This may take several minutes... ☕"
        gcloud sql instances create "$CLOUDSQL_INSTANCE" \
            --project="$GCP_PROJECT" \
            --database-version=POSTGRES_16 \
            --tier=db-f1-micro \
            --region="$REGION" \
            --quiet

        # Poll until ready
        log_info "Waiting for CloudSQL instance to become ready..."
        MAX_WAIT=600
        ELAPSED=0
        POLL_INTERVAL=10
        while [[ $ELAPSED -lt $MAX_WAIT ]]; do
            STATE=$(gcloud sql instances describe "$CLOUDSQL_INSTANCE" \
                --project="$GCP_PROJECT" \
                --format="value(state)" 2>/dev/null || echo "UNKNOWN")
            if [[ "$STATE" == "RUNNABLE" ]]; then
                break
            fi
            sleep $POLL_INTERVAL
            ELAPSED=$((ELAPSED + POLL_INTERVAL))
            echo -ne "   ${CYAN}⏳ Waiting... (${ELAPSED}s, state: ${STATE})${NC}\r"
        done
        echo "" # Clear the \r line

        if [[ $ELAPSED -ge $MAX_WAIT ]]; then
            log_error "CloudSQL instance creation timed out after ${MAX_WAIT}s."
            log_error "Check the GCP console for status."
            exit 1
        fi
        log_success "CloudSQL instance '${CLOUDSQL_INSTANCE}' is ready"
    fi

    # --- Database ---
    log_step "Setting up database '${DB_NAME}'..."
    EXISTING_DBS=$(gcloud sql databases list \
        --instance="$CLOUDSQL_INSTANCE" \
        --project="$GCP_PROJECT" \
        --format="value(name)" 2>/dev/null)
    if echo "$EXISTING_DBS" | grep -qx "$DB_NAME"; then
        log_success "Database '${DB_NAME}' already exists"
    else
        log_info "Creating database '${DB_NAME}'..."
        gcloud sql databases create "$DB_NAME" \
            --instance="$CLOUDSQL_INSTANCE" \
            --project="$GCP_PROJECT" \
            --quiet
        log_success "Created database '${DB_NAME}'"
    fi

    # --- Postgres Password (generated only on first run or forced rotation) ---
    # Rotating on every rerun adds a new secret version and desyncs running
    # services (they hold the old password) until the next redeploy.
    log_step "Setting up postgres user password..."
    DB_PASSWORD=""
    DB_SECRET_EXISTS=false
    if gcloud secrets describe "$SECRET_DB_PASSWORD" \
        --project="$GCP_PROJECT" &> /dev/null 2>&1; then
        DB_SECRET_EXISTS=true
    fi

    if [[ "$DB_SECRET_EXISTS" == true && "$ROTATE_DB_PASSWORD" != true ]]; then
        log_info "DB password secret already exists (not rotating). Use --rotate-db-password to force rotation."
    else
        if [[ "$DB_SECRET_EXISTS" == true ]]; then
            log_warn "Rotating postgres password (--rotate-db-password)"
        fi
        DB_PASSWORD=$(openssl rand -base64 24)
        gcloud sql users set-password postgres \
            --instance="$CLOUDSQL_INSTANCE" \
            --project="$GCP_PROJECT" \
            --password="$DB_PASSWORD" \
            --quiet
        log_success "Postgres password set"
    fi

    # --- Secret Manager Secrets ---
    log_step "Setting up Secret Manager secrets..."

    # Helper: create-or-update a secret
    create_or_update_secret() {
        local SECRET_ID="$1"
        local SECRET_VALUE="$2"

        if gcloud secrets describe "$SECRET_ID" \
            --project="$GCP_PROJECT" &> /dev/null 2>&1; then
            log_info "Secret '${SECRET_ID}' exists, adding new version..."
            echo -n "$SECRET_VALUE" | gcloud secrets versions add "$SECRET_ID" \
                --project="$GCP_PROJECT" \
                --data-file=- \
                --quiet
        else
            log_info "Creating secret '${SECRET_ID}'..."
            echo -n "$SECRET_VALUE" | gcloud secrets create "$SECRET_ID" \
                --project="$GCP_PROJECT" \
                --data-file=- \
                --quiet
        fi
        log_success "Secret '${SECRET_ID}' ready"
    }

    # DB password — only written when a new password was generated above
    if [[ -n "$DB_PASSWORD" ]]; then
        create_or_update_secret "$SECRET_DB_PASSWORD" "$DB_PASSWORD"
    else
        log_success "Secret '${SECRET_DB_PASSWORD}' unchanged (existing version kept)"
    fi

    # Master secret — generated ONCE, never rotated by this script.
    # It encrypts (AES) the signing keys stored in the DB; rotating it makes
    # those keys undecryptable, forcing regeneration and invalidating every
    # session/token. Rotation is a deliberate manual operation.
    if gcloud secrets describe "$SECRET_MASTER" \
        --project="$GCP_PROJECT" &> /dev/null 2>&1; then
        log_info "Master secret already exists (not rotating — rotation would invalidate all sessions and stored signing keys)."
    else
        MASTER_SECRET_VALUE=$(openssl rand -hex 32)
        create_or_update_secret "$SECRET_MASTER" "$MASTER_SECRET_VALUE"
    fi

    # SendGrid API key (empty placeholder)
    if gcloud secrets describe "$SECRET_SENDGRID" \
        --project="$GCP_PROJECT" &> /dev/null 2>&1; then
        log_success "Secret '${SECRET_SENDGRID}' already exists (not overwriting)"
    else
        echo -n "" | gcloud secrets create "$SECRET_SENDGRID" \
            --project="$GCP_PROJECT" \
            --data-file=- \
            --quiet
        log_success "Secret '${SECRET_SENDGRID}' created (empty placeholder)"
        log_warn "Set a real SendGrid API key later:"
        echo -e "   ${CYAN}echo -n 'SG.xxx' | gcloud secrets versions add ${SECRET_SENDGRID} --data-file=- --project=${GCP_PROJECT}${NC}"
    fi

    # --- Service Account ---
    log_step "Setting up service account '${SERVICE_ACCOUNT_NAME}'..."
    if gcloud iam service-accounts describe "$SERVICE_ACCOUNT" \
        --project="$GCP_PROJECT" &> /dev/null 2>&1; then
        log_success "Service account '${SERVICE_ACCOUNT_NAME}' already exists"
    else
        log_info "Creating service account '${SERVICE_ACCOUNT_NAME}'..."
        gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
            --display-name="AuthVital Runtime Service Account" \
            --project="$GCP_PROJECT"
        log_success "Created service account '${SERVICE_ACCOUNT_NAME}'"
    fi

    # Bind IAM roles (idempotent)
    log_step "Binding IAM roles to service account..."
    for ROLE in "${SA_ROLES[@]}"; do
        gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
            --member="serviceAccount:${SERVICE_ACCOUNT}" \
            --role="$ROLE" \
            --quiet > /dev/null 2>&1
        log_success "Bound ${ROLE}"
    done
fi

#######################################################################
# Phase 3: Run Migrations
#######################################################################

if [[ "$SKIP_MIGRATE" == true ]]; then
    log_header "Phase 3: Database Migration"
    log_warn "Skipping migration (--skip-migrate)"
else
    log_header "Phase 3: Database Migration"

    log_step "Creating/updating Cloud Run migration job 'authvital-migration'..."

    # Determine create vs update
    JOB_ACTION="create"
    if gcloud run jobs describe authvital-migration \
        --project="$GCP_PROJECT" \
        --region="$REGION" &> /dev/null 2>&1; then
        JOB_ACTION="update"
        log_info "Migration job already exists, updating..."
    else
        log_info "Creating migration job..."
    fi

    gcloud run jobs "$JOB_ACTION" authvital-migration \
        --image="$IMAGE" \
        --project="$GCP_PROJECT" \
        --region="$REGION" \
        --command="./migrate.sh" \
        --set-cloudsql-instances="$CLOUDSQL_CONNECTION" \
        --set-secrets="DB_PASSWORD=${SECRET_DB_PASSWORD}:latest,MASTER_SECRET=${SECRET_MASTER}:latest" \
        --set-env-vars="DB_HOST=${CLOUDSQL_SOCKET_PATH},DB_USERNAME=postgres,DB_DATABASE=${DB_NAME},BASE_URL=${BASE_URL},SUPER_ADMIN_EMAIL=${SUPER_ADMIN_EMAIL}" \
        --service-account="$SERVICE_ACCOUNT" \
        --quiet

    log_success "Migration job ready"

    log_step "Executing migration job..."
    log_info "Waiting for migration to complete..."
    gcloud run jobs execute authvital-migration \
        --project="$GCP_PROJECT" \
        --region="$REGION" \
        --wait \
        --quiet
    log_success "Migration completed successfully"
fi

#######################################################################
# Phase 4: Deploy Cloud Run Service
#######################################################################

log_header "Phase 4: Deploy Cloud Run Service"

log_step "Deploying AuthVital to Cloud Run..."
log_info "Image: ${IMAGE}"
echo ""

gcloud run deploy authvital \
    --image="$IMAGE" \
    --project="$GCP_PROJECT" \
    --region="$REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --port=8000 \
    --memory=512Mi \
    --min-instances=0 \
    --max-instances=3 \
    --service-account="$SERVICE_ACCOUNT" \
    --set-cloudsql-instances="$CLOUDSQL_CONNECTION" \
    --set-secrets="DB_PASSWORD=${SECRET_DB_PASSWORD}:latest,MASTER_SECRET=${SECRET_MASTER}:latest,SENDGRID_API_KEY=${SECRET_SENDGRID}:latest" \
    --set-env-vars="DB_HOST=${CLOUDSQL_SOCKET_PATH},DB_USERNAME=postgres,DB_DATABASE=${DB_NAME},BASE_URL=${BASE_URL},NODE_ENV=production,COOKIE_SECURE=true,PORT=8000,SUPER_ADMIN_EMAIL=${SUPER_ADMIN_EMAIL}" \
    --quiet

echo ""
log_success "AuthVital deployed to Cloud Run"

#######################################################################
# Phase 5: Summary
#######################################################################

log_header "Phase 5: Deployment Summary"

# Fetch service URL
log_step "Fetching service URL..."
SERVICE_URL=$(gcloud run services describe authvital \
    --project="$GCP_PROJECT" \
    --region="$REGION" \
    --format="value(status.url)")
log_success "Service URL retrieved"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}                     🎉 DEPLOYMENT COMPLETE 🎉                       ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "   ${CYAN}🌐 Service URL:${NC}        ${SERVICE_URL}"
echo -e "   ${CYAN}🔧 Admin Panel:${NC}        ${SERVICE_URL}/admin"
echo -e "   ${CYAN}📦 Image:${NC}              ${IMAGE}"
echo -e "   ${CYAN}☁️  GCP Project:${NC}        ${GCP_PROJECT}"
echo -e "   ${CYAN}📍 Region:${NC}             ${REGION}"
echo -e "   ${CYAN}🗄️  CloudSQL:${NC}           ${CLOUDSQL_INSTANCE}"
echo -e "   ${CYAN}📧 Super Admin:${NC}        ${SUPER_ADMIN_EMAIL}"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}GCP Console Links:${NC}"
echo -e "   Cloud Run:       https://console.cloud.google.com/run/detail/${REGION}/authvital?project=${GCP_PROJECT}"
echo -e "   CloudSQL:        https://console.cloud.google.com/sql/instances/${CLOUDSQL_INSTANCE}?project=${GCP_PROJECT}"
echo -e "   Secret Manager:  https://console.cloud.google.com/security/secret-manager?project=${GCP_PROJECT}"
echo ""
echo -e "${YELLOW}⚠️  Next Steps:${NC}"
echo -e "   ${YELLOW}1.${NC} Set up a custom domain mapping if '${BASE_URL}' differs from the Cloud Run URL:"
echo -e "      ${CYAN}gcloud run domain-mappings create --service=authvital --domain=auth.example.com --region=${REGION}${NC}"
echo -e "   ${YELLOW}2.${NC} Update the SendGrid secret with a real API key:"
echo -e "      ${CYAN}echo -n 'SG.xxx' | gcloud secrets versions add ${SECRET_SENDGRID} --data-file=- --project=${GCP_PROJECT}${NC}"
echo -e "   ${YELLOW}3.${NC} Access the admin panel at: ${GREEN}${SERVICE_URL}/admin${NC}"
echo ""
echo -e "${CYAN}Quick health check:${NC}"
echo -e "   curl ${SERVICE_URL}/health"
echo ""
