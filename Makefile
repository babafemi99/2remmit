SHELL := /bin/bash

PYTHON := .venv/bin/python
DJANGO_HOST := 127.0.0.1:8000
PROVIDER_WEBHOOK_SECRET ?= 2remit-local-provider-secret

.PHONY: dev backend frontend compose-up compose-down compose-logs seed test

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
	docker compose --env-file .env up --build -d

compose-down:
	docker compose --env-file .env down

compose-logs:
	docker compose --env-file .env logs --follow backend frontend vector victoria-logs

seed:
	docker compose --env-file .env run --rm setup python manage.py seed_demo

test:
	@cd backend && ../$(PYTHON) manage.py test
	@cd frontend && npm run format:check && npm run lint && npm run type-check && npm test && npm run build
