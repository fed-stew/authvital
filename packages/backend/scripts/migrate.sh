#!/bin/sh
# =============================================================================
# Migration-only entrypoint (wrapper for docker-start.sh)
# Used by Cloud Run Jobs or standalone migration runs
# =============================================================================

export RUN_MODE=migration
exec ./start.sh
