# 🏗️ HackHub Development Makefile
# This Makefile provides convenient commands for local development and deployment

# Variables
NODE_VERSION := 24.1.0
SUPABASE_PROJECT_ID := your-project-id
DOCKER_COMPOSE_FILE := docker-compose.yml

# Colors for terminal output
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Default target
.DEFAULT_GOAL := help

##@ Help
.PHONY: help
help: ## Display this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\n🏗️  HackHub Development Commands\n\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Setup & Installation
.PHONY: setup setup/local install check-node check-supabase
setup: setup/local ## Complete local development setup

setup/local: check-node install check-supabase supabase/setup ## Set up local development environment
	@echo "$(GREEN)✅ Local development environment setup complete!$(NC)"
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  1. Copy .env.example to .env.local and configure your variables"
	@echo "  2. Run 'make start/local' to start the development servers"
	@echo "  3. Visit http://localhost:5173 to view the application"

install: ## Install Node.js dependencies
	@echo "$(YELLOW)📦 Installing Node.js dependencies...$(NC)"
	@npm ci

check-node: ## Check if Node.js version is correct
	@echo "$(YELLOW)🔍 Checking Node.js version...$(NC)"
	@node_version=$$(node --version | sed 's/v//'); \
	if [ "$$node_version" != "$(NODE_VERSION)" ]; then \
		echo "$(RED)❌ Node.js version mismatch. Expected: $(NODE_VERSION), Found: $$node_version$(NC)"; \
		echo "$(YELLOW)💡 Consider using nvm: nvm install $(NODE_VERSION) && nvm use $(NODE_VERSION)$(NC)"; \
		exit 1; \
	else \
		echo "$(GREEN)✅ Node.js version $(NODE_VERSION) confirmed$(NC)"; \
	fi

check-supabase: ## Check if Supabase CLI is installed
	@echo "$(YELLOW)🔍 Checking Supabase CLI...$(NC)"
	@if ! command -v supabase >/dev/null 2>&1; then \
		echo "$(RED)❌ Supabase CLI not found$(NC)"; \
		echo "$(YELLOW)💡 Install it with: npm install -g supabase@latest$(NC)"; \
		echo "$(YELLOW)💡 Or visit: https://supabase.com/docs/guides/cli$(NC)"; \
		exit 1; \
	else \
		echo "$(GREEN)✅ Supabase CLI found$(NC)"; \
	fi

##@ Development Servers
.PHONY: start start/local start/frontend start/supabase stop stop/all status
start: start/local ## Start all local development servers

start/local: ## Start frontend and Supabase locally
	@echo "$(GREEN)🚀 Starting local development environment...$(NC)"
	@make --no-print-directory start/supabase &
	@sleep 3
	@make --no-print-directory start/frontend

start/frontend: ## Start the Vite development server
	@echo "$(YELLOW)🌐 Starting frontend development server...$(NC)"
	@npm run dev

start/supabase: ## Start Supabase local development
	@echo "$(YELLOW)🗄️  Starting Supabase local services...$(NC)"
	@supabase start

stop: stop/all ## Stop all development servers

stop/all: ## Stop all local services
	@echo "$(RED)⏹️  Stopping all local services...$(NC)"
	@supabase stop
	@pkill -f "vite" || true
	@echo "$(GREEN)✅ All services stopped$(NC)"

status: ## Show status of local services
	@echo "$(YELLOW)📊 Checking service status...$(NC)"
	@supabase status || echo "$(RED)Supabase not running$(NC)"
	@echo ""
	@if pgrep -f "vite" > /dev/null; then \
		echo "$(GREEN)✅ Frontend server is running$(NC)"; \
	else \
		echo "$(RED)❌ Frontend server is not running$(NC)"; \
	fi

##@ Database Management
.PHONY: db/reset db/migrate db/status supabase/setup
db/reset: ## Reset the local database
	@echo "$(YELLOW)🔄 Resetting local database...$(NC)"
	@supabase db reset

db/migrate: ## Run database migrations
	@echo "$(YELLOW)🔄 Running database migrations...$(NC)"
	@supabase db push

db/status: ## Show database status and connection info
	@echo "$(YELLOW)📊 Database status:$(NC)"
	@supabase status

supabase/setup: ## Initialize Supabase project locally
	@echo "$(YELLOW)🔧 Setting up Supabase local development...$(NC)"
	@if [ ! -f "supabase/config.toml" ]; then \
		supabase init; \
	fi
	@supabase start
	@echo "$(GREEN)✅ Supabase setup complete$(NC)"

##@ Code Quality & Testing
.PHONY: lint lint/fix format format/check type-check clean
lint: ## Run ESLint
	@echo "$(YELLOW)🔍 Running ESLint...$(NC)"
	@npm run lint

lint/fix: ## Run ESLint with auto-fix
	@echo "$(YELLOW)🔧 Running ESLint with auto-fix...$(NC)"
	@npm run lint -- --fix

format: ## Format code with Prettier
	@echo "$(YELLOW)🎨 Formatting code with Prettier...$(NC)"
	@npx prettier --write .

format/check: ## Check code formatting
	@echo "$(YELLOW)🎨 Checking code formatting...$(NC)"
	@npx prettier --check .

type-check: ## Run TypeScript type checking
	@echo "$(YELLOW)📝 Running TypeScript type checking...$(NC)"
	@npx tsc --noEmit

clean: ## Clean node_modules and build artifacts
	@echo "$(YELLOW)🧹 Cleaning up...$(NC)"
	@rm -rf node_modules
	@rm -rf dist
	@rm -rf .vite
	@echo "$(GREEN)✅ Cleanup complete$(NC)"

##@ Build & Preview
.PHONY: build build/prod preview
build: build/prod ## Build the application

build/prod: ## Build for production
	@echo "$(YELLOW)🏗️  Building for production...$(NC)"
	@npm run build
	@echo "$(GREEN)✅ Production build complete$(NC)"

preview: ## Preview the production build
	@echo "$(YELLOW)👀 Starting preview server...$(NC)"
	@npm run preview

##@ Admin & Utilities
.PHONY: env/example logs
env/example: ## Create .env.example from current .env.local
	@echo "$(YELLOW)📄 Creating .env.example...$(NC)"
	@if [ -f ".env.local" ]; then \
		sed 's/=.*/=/' .env.local > .env.example; \
		echo "$(GREEN)✅ .env.example created$(NC)"; \
	else \
		echo "$(RED)❌ .env.local not found$(NC)"; \
	fi

logs: ## Show Supabase logs
	@echo "$(YELLOW)📄 Showing Supabase logs...$(NC)"
	@supabase logs

##@ Quality Assurance
.PHONY: qa qa/quick qa/full validate
qa: qa/quick ## Run quick quality assurance checks

qa/quick: ## Run quick QA checks (lint, format, type-check)
	@echo "$(GREEN)🔍 Running quick quality assurance checks...$(NC)"
	@make --no-print-directory lint
	@make --no-print-directory format/check
	@make --no-print-directory type-check
	@echo "$(GREEN)✅ Quick QA checks complete$(NC)"

qa/full: ## Run full quality assurance suite
	@echo "$(GREEN)🔍 Running full quality assurance suite...$(NC)"
	@make --no-print-directory qa/quick
	@make --no-print-directory build
	@echo "$(GREEN)✅ Full QA suite complete$(NC)"

validate: ## Validate the entire project setup
	@echo "$(GREEN)✅ Validating project setup...$(NC)"
	@make --no-print-directory check-node
	@make --no-print-directory check-supabase
	@echo "$(YELLOW)📦 Checking dependencies...$(NC)"
	@npm list --depth=0 > /dev/null 2>&1 && echo "$(GREEN)✅ Dependencies OK$(NC)" || echo "$(RED)❌ Dependency issues$(NC)"
	@echo "$(GREEN)✅ Project validation complete$(NC)"

##@ Development Workflow
.PHONY: dev/reset dev/fresh dev/quick-start
dev/reset: ## Reset development environment completely
	@echo "$(YELLOW)🔄 Resetting development environment...$(NC)"
	@make --no-print-directory stop
	@make --no-print-directory clean
	@make --no-print-directory db/reset
	@make --no-print-directory install
	@echo "$(GREEN)✅ Development environment reset complete$(NC)"

dev/fresh: ## Fresh start - clean install and setup
	@echo "$(GREEN)🌱 Starting fresh development setup...$(NC)"
	@make --no-print-directory dev/reset
	@make --no-print-directory setup/local
	@echo "$(GREEN)✅ Fresh development environment ready$(NC)"

dev/quick-start: ## Quick start for returning developers
	@echo "$(GREEN)⚡ Quick start for development...$(NC)"
	@make --no-print-directory validate
	@make --no-print-directory start/local
	@echo "$(GREEN)✅ Development environment started$(NC)"

##@ Information
.PHONY: info version ports assets
info: ## Show project information
	@echo "$(GREEN)📋 HackHub Project Information$(NC)"
	@echo "$(YELLOW)Node.js Version:$(NC) $(NODE_VERSION)"
	@echo "$(YELLOW)Project Name:$(NC) HackHub - Modern Hackathon Management Platform"
	@echo "$(YELLOW)Frontend:$(NC) React + TypeScript + Vite + Mantine"
	@echo "$(YELLOW)Backend:$(NC) Supabase (PostgreSQL + Auth + Storage)"
	@echo "$(YELLOW)Brand Assets:$(NC) Available in assets/ directory"
	@echo "$(YELLOW)Local URLs:$(NC)"
	@echo "  • Frontend: http://localhost:5173"
	@echo "  • Supabase Studio: http://localhost:54323"
	@echo "  • Supabase API: http://localhost:54321"

version: ## Show version information
	@echo "$(GREEN)📊 Version Information$(NC)"
	@echo "$(YELLOW)Node.js:$(NC) $$(node --version)"
	@echo "$(YELLOW)npm:$(NC) $$(npm --version)"
	@echo "$(YELLOW)Supabase CLI:$(NC) $$(supabase --version 2>/dev/null || echo 'Not installed')"

ports: ## Show ports used by the application
	@echo "$(GREEN)🔌 Port Information$(NC)"
	@echo "$(YELLOW)Frontend (Vite):$(NC) 5173"
	@echo "$(YELLOW)Supabase API:$(NC) 54321"
	@echo "$(YELLOW)Supabase Studio:$(NC) 54323"
	@echo "$(YELLOW)Supabase DB:$(NC) 54322"
	@echo "$(YELLOW)Preview Server:$(NC) 4173"

assets: ## List available brand assets
	@echo "$(GREEN)🎨 Available Brand Assets$(NC)"
	@echo "$(YELLOW)Location:$(NC) assets/ directory"
	@echo ""
	@if [ -d "assets" ]; then \
		echo "$(YELLOW)📁 Available files:$(NC)"; \
		ls -la assets/ | grep -E '\.(svg|png)$$' | awk '{print "  • " $$9}' || echo "  No assets found"; \
	else \
		echo "$(RED)❌ Assets directory not found$(NC)"; \
	fi
	@echo ""
	@echo "$(YELLOW)💡 Usage:$(NC) Include in documentation, presentations, and branding"
