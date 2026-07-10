.PHONY: dev dev-bg dev-stop demo-prep seed-reset verify-agents test-backend test-all prod-install prod-up prod-down prod-logs prod-update public-up public-down
dev:
	@./scripts/dev.sh

dev-bg:
	@chmod +x scripts/dev-bg.sh && ./scripts/dev-bg.sh

dev-stop:
	@chmod +x scripts/dev-stop.sh && ./scripts/dev-stop.sh

public-up:
	@chmod +x scripts/public-up.sh && ./scripts/public-up.sh

public-down:
	@chmod +x scripts/public-down.sh && ./scripts/public-down.sh

demo-prep:
	@chmod +x scripts/demo-prep.sh && ./scripts/demo-prep.sh

seed-reset:
	@cd backend && ./venv/bin/python -m src.database.seed --reset-agents

verify-agents:
	@cd backend && ./venv/bin/python scripts/verify_agents.py

test-backend:
	@cd backend && ./venv/bin/pip install -q openpyxl jdatetime pytest-asyncio 2>/dev/null; ./venv/bin/python -m pytest tests/ -v --tb=short

test-all: test-backend verify-agents
	@cd frontend && npm run test

prod-install:
	@chmod +x scripts/install-ubuntu.sh scripts/deploy-update.sh
	@sudo ./scripts/install-ubuntu.sh

prod-up:
	@docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d

prod-down:
	@docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod down

prod-logs:
	@docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

prod-update:
	@chmod +x scripts/deploy-update.sh && sudo ./scripts/deploy-update.sh
