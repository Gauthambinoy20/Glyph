# Glyph — common tasks. Run `make <target>`.
# Backend tools assume the venv is active (or on PATH): cd backend && . .venv/bin/activate
.PHONY: help install test lint fmt eval eval-repos up run backend frontend

help: ## Show this help
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-10s %s\n", $$1, $$2}'

install: ## Install backend + frontend dependencies
	cd backend && pip install -r requirements.txt -r requirements-dev.txt
	cd frontend && npm install

test: ## Run all tests (backend + frontend)
	cd backend && python -m pytest -q
	cd frontend && npm test

lint: ## Lint + type-check (ruff, mypy, tsc)
	cd backend && ruff check app tests && ruff format --check app tests && mypy app
	cd frontend && npx tsc -b

fmt: ## Auto-format the backend (ruff)
	cd backend && ruff format app tests

eval: ## Quick hit-rate on Glyph's own backend (single repo, fast)
	cd backend && python -m app.quality.evaluate

eval-repos: ## Real cross-language hit-rate: clone 5 pinned repos, score fast + careful
	cd backend && python -m app.quality.evaluate_repos

up: ## One-command run with Docker (open http://localhost:5173)
	docker compose up --build

run: up ## Alias for `up`

backend: ## Run the API in dev mode (http://localhost:8000)
	cd backend && uvicorn app.main:app --reload --port 8000

frontend: ## Run the web app in dev mode (http://localhost:5173)
	cd frontend && npm run dev
