SHELL := /bin/bash

PYTHON := .venv/bin/python
DJANGO_HOST := 127.0.0.1:8000
PROVIDER_WEBHOOK_SECRET ?= 2remit-local-provider-secret
COMPOSE_ENV_FILE := $(if $(wildcard .env),.env,.env.example)
COMPOSE := docker compose --env-file $(COMPOSE_ENV_FILE)

.PHONY: dev backend frontend compose-up compose-down compose-reset compose-logs seed test test-backend test-frontend

dev:
	@set -eu; \
	backend_pid=""; frontend_pid=""; \
	cleanup() { \
		[ -z "$$frontend_pid" ] || kill "$$frontend_pid" 2>/dev/null || true; \
		[ -z "$$backend_pid" ] || kill "$$backend_pid" 2>/dev/null || true; \
	}; \
	trap cleanup EXIT INT TERM; \
	( cd backend && exec env \
		PROVIDER_WEBHOOK_SECRET="$(PROVIDER_WEBHOOK_SECRET)" \
		ENABLE_PROVIDER_SIMULATOR=true \
		PROVIDER_SIMULATOR_WEBHOOK_URL=http://$(DJANGO_HOST)/api/webhooks/provider/ \
		../$(PYTHON) manage.py runserver $(DJANGO_HOST) ) & \
	backend_pid=$$!; \
	( cd frontend && exec npm run dev ) & \
	frontend_pid=$$!; \
	wait

backend:
	@cd backend && \
	PROVIDER_WEBHOOK_SECRET="$(PROVIDER_WEBHOOK_SECRET)" \
	ENABLE_PROVIDER_SIMULATOR=true \
	PROVIDER_SIMULATOR_WEBHOOK_URL=http://$(DJANGO_HOST)/api/webhooks/provider/ \
	../$(PYTHON) manage.py runserver $(DJANGO_HOST)

frontend:
	@cd frontend && npm run dev

compose-up:
	$(COMPOSE) up --build -d

compose-down:
	$(COMPOSE) down

# Removes this Compose project's persisted database and log data. Use only when
# intentionally starting over, including after changing PostgreSQL credentials.
compose-reset:
	$(COMPOSE) down --volumes --remove-orphans

compose-logs:
	$(COMPOSE) logs --follow backend frontend vector victoria-logs

seed:
	$(COMPOSE) run --rm setup python manage.py seed_demo

test: test-backend test-frontend

test-backend:
	$(COMPOSE) build backend-tests
	$(COMPOSE) run --rm backend-tests

test-frontend:
	$(COMPOSE) build frontend-tests
	$(COMPOSE) run --rm frontend-tests
