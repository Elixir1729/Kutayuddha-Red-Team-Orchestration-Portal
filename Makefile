.PHONY: up down dev-backend dev-frontend dev setup-backend setup-frontend logs

# ── Full stack via Docker Compose ────────────────────────────────────
up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

# ── Local development (backend + frontend natively, DB via Docker) ───
infra:
	docker compose up -d postgres redis

setup-backend:
	cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

setup-frontend:
	cd frontend && npm install

dev-backend:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

# Run DB + backend + frontend for local development
dev: infra
	@echo "PostgreSQL on :5432, Redis on :6379"
	@echo "Run in separate terminals:"
	@echo "  make dev-backend   (API on :8000)"
	@echo "  make dev-frontend  (UI on :3000)"
