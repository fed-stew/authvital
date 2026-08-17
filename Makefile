# =============================================================================
# AuthVital — blessed one-command lifecycle for the LOCAL UAT (examples) stack
# =============================================================================
# Why a Makefile (and not COMPOSE_FILE in .env)?
#   - .env (and .env.*) is .gitignored, so a committed COMPOSE_FILE is impossible.
#   - Setting COMPOSE_FILE globally would silently force the examples overlay on
#     people who only want the base stack (`docker compose up` -> localhost:8080),
#     which is surprising. These targets keep the base stack pristine while giving
#     a dead-simple entrypoint for the full subdomain UAT environment.
#
# Blessed commands:
#   make up      -> cold start: self-configures seed + certs + named volume,
#                   builds and boots the whole stack (Postgres + migrate + api
#                   + Traefik + 3 apps)
#   make down    -> stop everything, KEEP the data volume
#   make fresh   -> wipe the data volume (down -v) + reseed from scratch
#                   (scripts/reset-examples.sh is the interactive npm equivalent)
#   make logs    -> follow logs for all services
#   make ps      -> show service status
#   make certs   -> OPTIONAL: mint a locally-TRUSTED cert with mkcert (no warning)
#
# Postgres host port: the apps reach Postgres in-network (postgres:5432), so the
# host publish is only a convenience. We default it to 5433 to dodge the very
# common :5432 collision with another project's DB — you never have to pass it.
# Override if you like:  make up POSTGRES_PORT=5544
# =============================================================================

COMPOSE := docker compose -f docker-compose.yml -f docker-compose.examples.yml

# Unlikely-to-collide default; exported so compose's ${POSTGRES_PORT:-...} sees it.
POSTGRES_PORT ?= 5433
export POSTGRES_PORT

SEED_FILE  := seed.config.yaml
UAT_SEED   := seed.config.uat.yaml
CERT_FILE  := examples/traefik/certs/lvh.me.pem

.DEFAULT_GOAL := help

.PHONY: help up down fresh logs ps certs ensure-seed ensure-certs

help: ## Show this help
	@echo "AuthVital local UAT stack — blessed commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-8s %s\n", $$1, $$2}'
	@echo ""
	@echo "URLs once up:  https://auth.lvh.me  https://app.lvh.me  https://seat.lvh.me  https://bff.lvh.me"
	@echo "Postgres host port (override-able): $(POSTGRES_PORT)"

# The UAT stack itself mounts the COMMITTED $(UAT_SEED) (the overlay shadows the
# base file's ./seed.config.yaml mount by container-path), so this copy is a
# convenience for the plain BASE stack (`docker compose up`), whose bind-mount
# expects a root seed.config.yaml to exist. Copy-if-missing only — a personal
# seed.config.yaml is never overwritten.
ensure-seed:
	@if [ ! -f $(SEED_FILE) ]; then \
		echo "==> No $(SEED_FILE) found — copying $(UAT_SEED) -> $(SEED_FILE)"; \
		cp $(UAT_SEED) $(SEED_FILE); \
	fi

# Belt-and-braces: the one-shot `examples-certs` compose service also mints a
# self-signed cert on first boot. Running gen-certs.sh here means mkcert users
# get a locally-TRUSTED cert from the very first `make up` (no browser warning).
ensure-certs:
	@if [ ! -f $(CERT_FILE) ]; then \
		echo "==> No TLS cert found — generating (mkcert if installed, else self-signed)"; \
		bash examples/traefik/gen-certs.sh; \
	fi

up: ensure-seed ensure-certs ## Start the full UAT stack (auto seed + certs + named volume); data KEPT across restarts
	$(COMPOSE) up --build -d
	@echo ""
	@echo "Stack up. Hosts (self-signed cert -> browser warning unless mkcert was installed):"
	@echo "  IdP / admin : https://auth.lvh.me   (/admin)"
	@echo "  React SPA   : https://app.lvh.me"
	@echo "  Seat SPA    : https://seat.lvh.me"
	@echo "  Express BFF : https://bff.lvh.me    (/events)"
	@echo "  Traefik     : http://localhost:8081"
	@echo "Base-only IdP also on http://localhost:8080."

down: ## Stop the stack, KEEP the data volume (fast restart, data preserved)
	$(COMPOSE) down

fresh: ## DESTRUCTIVE: wipe the Postgres volume (down -v) + reseed a clean baseline
	$(COMPOSE) down -v
	@$(MAKE) up
	@echo ""
	@echo "Fresh reseed complete — only the $(UAT_SEED) baseline exists."

logs: ## Follow logs for all services
	$(COMPOSE) logs -f

ps: ## Show status of all services
	$(COMPOSE) ps

certs: ## OPTIONAL upgrade: mint a locally-TRUSTED cert via mkcert (no browser warning)
	bash examples/traefik/gen-certs.sh
	@echo "Trusted cert in place. Restart Traefik to pick it up:  make down && make up"
