#!/usr/bin/env bash
# =============================================================================
# gen-certs.sh — Generate TLS certs for the examples env
# =============================================================================
#
# We serve every example host over HTTPS (Secure cookies everywhere) using
# *.lvh.me, which resolves to 127.0.0.1.
#
# PREFERRED: mkcert mints a cert signed by a local CA your OS/browser trusts,
# so no scary red padlocks.
#     macOS:   brew install mkcert nss
#     (nss is needed so Firefox trusts the local CA too)
#
# FALLBACK: if mkcert isn't installed, we mint a plain self-signed cert with
# openssl so the stack still boots over HTTPS (your browser will warn it's
# untrusted until you install mkcert). This means `npm run certs:examples`
# never leaves the certs dir empty — Traefik can always load TLS.
#
# Usage:
#     bash examples/traefik/gen-certs.sh
#     # or:  npm run certs:examples
#
# Idempotent: re-running simply overwrites the cert files.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/certs"

mkdir -p "$CERTS_DIR"
CERT_FILE="$CERTS_DIR/lvh.me.pem"
KEY_FILE="$CERTS_DIR/lvh.me-key.pem"

if command -v mkcert >/dev/null 2>&1; then
  echo "==> mkcert found. Ensuring local CA is installed (idempotent)..."
  mkcert -install

  echo "==> Generating locally-TRUSTED cert + key for lvh.me and subdomains..."
  mkcert \
    -cert-file "$CERT_FILE" \
    -key-file "$KEY_FILE" \
    "lvh.me" \
    "*.lvh.me" \
    "*.app.lvh.me" \
    "*.seat.lvh.me" \
    "*.bff.lvh.me"

  echo ""
  echo " Trusted certs written to: $CERTS_DIR"
else
  # ---------------------------------------------------------------------------
  # Fallback: mkcert isn't installed. Rather than hard-fail (which leaves the
  # certs dir empty and makes Traefik unable to load TLS at all), mint a plain
  # self-signed cert with openssl so the stack still boots over HTTPS. Browsers
  # will show an "untrusted" warning until you install mkcert for a real,
  # locally-trusted CA — but curl -k and click-through work fine for UAT.
  # ---------------------------------------------------------------------------
  if ! command -v openssl >/dev/null 2>&1; then
    echo " Neither mkcert nor openssl is installed — cannot generate certs."
    echo "   Install one of them first:"
    echo "     macOS (trusted):   brew install mkcert nss   (recommended)"
    echo "     any   (untrusted): install openssl"
    exit 1
  fi

  echo " mkcert is not installed — falling back to a SELF-SIGNED cert (openssl)."
  echo "   TLS will load and the stack will boot, but your browser will warn"
  echo "   that the cert is untrusted. For a trusted cert (no warnings):"
  echo "     brew install mkcert nss && npm run certs:examples"
  echo ""
  echo "==> Generating self-signed cert + key for lvh.me and subdomains..."
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -subj "/CN=lvh.me" \
    -addext "subjectAltName=DNS:lvh.me,DNS:*.lvh.me,DNS:*.app.lvh.me,DNS:*.seat.lvh.me,DNS:*.bff.lvh.me"

  echo ""
  echo " Self-signed certs written to: $CERTS_DIR"
fi

echo "   - lvh.me.pem"
echo "   - lvh.me-key.pem"
echo ""
echo "   Traefik picks these up via examples/traefik/dynamic/tls.yml"
