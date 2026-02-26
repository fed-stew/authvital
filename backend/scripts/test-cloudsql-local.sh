#!/bin/bash
# =============================================================================
# Local Cloud SQL Connection Test
# Tests the DATABASE_URL format before deploying to Cloud Run
# =============================================================================

# Note: NOT using 'set -e' so we can test all formats even if some fail

# Configuration - UPDATE THESE!
CLOUD_SQL_INSTANCE="anokanban-dev:us-central1:anokanban-db-1"
DB_USERNAME="authvader"
DB_DATABASE="authvader"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Cloud SQL Local Connection Test ===${NC}\n"

# Check if cloud-sql-proxy is installed
if ! command -v cloud-sql-proxy &> /dev/null; then
    echo -e "${RED}cloud-sql-proxy not found!${NC}"
    echo ""
    echo "Install it with:"
    echo "  # macOS"
    echo "  brew install cloud-sql-proxy"
    echo ""
    echo "  # Linux"
    echo "  curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64"
    echo "  chmod +x cloud-sql-proxy"
    echo "  sudo mv cloud-sql-proxy /usr/local/bin/"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ cloud-sql-proxy found${NC}"

# Check if logged into gcloud
if ! gcloud auth print-access-token &> /dev/null; then
    echo -e "${RED}Not logged into gcloud!${NC}"
    echo "Run: gcloud auth login"
    exit 1
fi

echo -e "${GREEN}✓ gcloud authenticated${NC}"

# Prompt for password
echo ""
read -s -p "Enter DB password for ${DB_USERNAME}: " DB_PASSWORD
echo ""

# URL-encode the password (handles special chars like @, #, !, etc.)
urlencode() {
    python3 -c "import urllib.parse; print(urllib.parse.quote('''$1''', safe=''))"
}
ENCODED_PASSWORD=$(urlencode "$DB_PASSWORD")

# Create socket directory
SOCKET_DIR="/tmp/cloudsql"
mkdir -p "$SOCKET_DIR"

echo ""
echo -e "${YELLOW}Starting Cloud SQL Proxy in Unix socket mode...${NC}"
echo "Socket will be at: ${SOCKET_DIR}/${CLOUD_SQL_INSTANCE}"
echo ""

# Start proxy in background
cloud-sql-proxy --unix-socket="$SOCKET_DIR" "$CLOUD_SQL_INSTANCE" &
PROXY_PID=$!

# Wait for socket to be ready
echo "Waiting for proxy to start..."
sleep 3

# Check if proxy is running
if ! kill -0 $PROXY_PID 2>/dev/null; then
    echo -e "${RED}Proxy failed to start! Check your gcloud permissions.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Proxy running (PID: $PROXY_PID)${NC}"
echo ""

# Build the DATABASE_URL exactly like docker-start.sh does
DB_HOST="${SOCKET_DIR}/${CLOUD_SQL_INSTANCE}"
ENCODED_DB_HOST=$DB_HOST

# Test different URL formats
echo -e "${YELLOW}Testing URL formats...${NC}"
echo ""

# Format 1: Official Google format - localhost + unencoded socket path
# postgresql://DB_USER:DB_PASS@localhost/DB_NAME?host=/cloudsql/PROJECT-ID:REGION:INSTANCE-NAME
URL1="postgresql://${DB_USERNAME}:${ENCODED_PASSWORD}@localhost/${DB_DATABASE}?host=${DB_HOST}"
echo -e "Format 1 (Google recommended - localhost + unencoded host):"
echo "  postgresql://${DB_USERNAME}:<encoded>@localhost/${DB_DATABASE}?host=${DB_HOST}"

# Format 2: Empty host (between @ and /)
URL2="postgresql://${DB_USERNAME}:${ENCODED_PASSWORD}@/${DB_DATABASE}?host=${DB_HOST}"
echo -e "Format 2 (empty host):"
echo "  postgresql://${DB_USERNAME}:<encoded>@/${DB_DATABASE}?host=${DB_HOST}"

# Format 3: Using 'localhost' in host param with port-style syntax
URL3="postgresql://${DB_USERNAME}:${ENCODED_PASSWORD}@localhost/${DB_DATABASE}?host=${DB_HOST}"
echo -e "Format 3 (same as Format 1 for validation):"
echo "  postgresql://${DB_USERNAME}:<encoded>@localhost/${DB_DATABASE}?host=${DB_HOST}"

echo ""
echo -e "${YELLOW}Testing connection with Prisma...${NC}"
echo ""

# Test with Prisma
cd "$(dirname "$0")/.."

# Test Format 1 first (Google's recommended format)
echo "Testing Format 1 (localhost + unencoded host path)..."
export DATABASE_URL="$URL1"
if npx prisma db execute --stdin <<< "SELECT 1;"; then
    echo -e "${GREEN}✓ Format 1 WORKS!${NC}"
    WORKING_FORMAT=1
else
    echo -e "${RED}✗ Format 1 failed (see error above)${NC}"
    WORKING_FORMAT=0
fi

echo ""
echo "Testing Format 2 (empty host)..."
export DATABASE_URL="$URL2"
if npx prisma db execute --stdin <<< "SELECT 1;"; then
    echo -e "${GREEN}✓ Format 2 WORKS!${NC}"
    [ $WORKING_FORMAT -eq 0 ] && WORKING_FORMAT=2
else
    echo -e "${RED}✗ Format 2 failed (see error above)${NC}"
fi

echo ""
if [ $WORKING_FORMAT -gt 0 ]; then
    echo -e "${GREEN}=== Format $WORKING_FORMAT works! ===${NC}"
    echo ""
    echo "For docker-start.sh, use:"
    echo -e "  ${YELLOW}postgresql://\${DB_USERNAME}:<url-encoded-password>@localhost/\${DB_DATABASE}?host=\${DB_HOST}${NC}"
else
    echo -e "${RED}=== All formats failed! Check your credentials and proxy connection ===${NC}"
fi

echo ""
echo -e "${YELLOW}Cleaning up...${NC}"
kill $PROXY_PID 2>/dev/null || true
echo -e "${GREEN}Done!${NC}"
