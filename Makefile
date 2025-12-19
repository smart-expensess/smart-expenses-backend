.PHONY: help build build-prod build-dev up down logs ps shell-db migrate reset clean

help:
	@echo "Smart Expense Pro - Backend Docker Commands"
	@echo "============================================"
	@echo ""
	@echo "Build Commands:"
	@echo "  make build              - Build production image"
	@echo "  make build-dev          - Build development image"
	@echo ""
	@echo "Production Commands:"
	@echo "  make up                 - Start production containers"
	@echo "  make down               - Stop production containers"
	@echo "  make logs               - View production logs"
	@echo ""
	@echo "Development Commands:"
	@echo "  make dev-up             - Start development containers"
	@echo "  make dev-down           - Stop development containers"
	@echo "  make dev-logs           - View development logs"
	@echo ""
	@echo "Database Commands:"
	@echo "  make migrate            - Run Prisma migrations"
	@echo "  make reset              - Reset database (WARNING: deletes data)"
	@echo "  make shell-db           - Access database shell"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make ps                 - List containers"
	@echo "  make clean              - Remove all containers and volumes"
	@echo ""

# Production
build:
	docker build -f Dockerfile.prod -t smart-expense-backend:latest .

up:
	docker-compose -f docker-compose.yml up -d

down:
	docker-compose -f docker-compose.yml down

restart: down up

logs:
	docker-compose -f docker-compose.yml logs -f backend

logs-db:
	docker-compose -f docker-compose.yml logs -f postgres

ps:
	docker-compose -f docker-compose.yml ps

# Development
build-dev:
	docker build -f Dockerfile.dev -t smart-expense-backend-dev:latest .

dev-up:
	docker-compose -f docker-compose.dev.yml up

dev-down:
	docker-compose -f docker-compose.dev.yml down

dev-logs:
	docker-compose -f docker-compose.dev.yml logs -f backend

dev-logs-db:
	docker-compose -f docker-compose.dev.yml logs -f postgres

dev-restart: dev-down dev-up

# Database
migrate:
	docker-compose -f docker-compose.yml exec backend npx prisma migrate deploy

migrate-dev:
	docker-compose -f docker-compose.dev.yml exec backend npx prisma migrate deploy

reset:
	@echo "⚠️  WARNING: This will reset the database and delete all data!"
	docker-compose -f docker-compose.yml exec backend npx prisma migrate reset

shell-db:
	docker-compose -f docker-compose.yml exec postgres psql -U postgres -d RMS

shell-backend:
	docker-compose -f docker-compose.yml exec backend /bin/sh

# Utility
clean:
	docker-compose -f docker-compose.yml down -v
	docker-compose -f docker-compose.dev.yml down -v
	@echo "✅ All containers and volumes removed"

status:
	docker-compose -f docker-compose.yml ps
	@echo ""
	@curl -s http://localhost:4000/api/health 2>/dev/null && echo "✅ Backend is healthy" || echo "❌ Backend is not responding"
