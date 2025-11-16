## Modules

# Kalshi Search Service (Backend API)
[group('modules')]
mod search

## Aliases

# Common shortcuts for search module
alias test-search := search::test-search

## Recipes

# Show all commands (default)
[private]
default:
    @just --list

# Install dependencies
[group('sync')]
install:
    pnpm install

# Run all checks (lint + typecheck + test)
[group('check')]
check:
    pnpm --filter kalshi-search-service check

# Run linter
[group('check')]
lint:
    pnpm --filter kalshi-search-service lint

# Fix linter errors
[group('check')]
lint-fix:
    pnpm --filter kalshi-search-service lint:fix

# Run type checking
[group('check')]
typecheck:
    pnpm --filter kalshi-search-service exec tsc --noEmit

# Format code
[group('check')]
format:
    pnpm --filter kalshi-search-service format

# Check code formatting
[group('check')]
format-check:
    pnpm --filter kalshi-search-service format:check

# Run tests
[group('check')]
test:
    pnpm --filter kalshi-search-service test

# Fix all issues (lint + format)
[group('check')]
fix: lint-fix format

# Nuke all node_modules directories
[group('sync')]
clean:
    rm -rf node_modules/ search/node_modules/

## Dev Commands

# Start development server (defaults to search)
[group('dev')]
dev:
    pnpm --filter kalshi-search-service dev

# Start search dev server with hot reload
[group('dev')]
dev-search:
    just search dev

# Test search API (production)
[group('dev')]
test-api query="bitcoin":
    just search test-search "{{query}}"

# Test search API health (production)
[group('dev')]
health:
    just search test-health-prod

## Deploy Commands

# Deploy search service to Fly.io
[group('deploy')]
deploy-search:
    cd search && fly deploy --ha=false

# Check search service logs
[group('deploy')]
logs-search:
    cd search && fly logs --app kalshi-search-api

# Check search service status
[group('deploy')]
status-search:
    cd search && fly status --app kalshi-search-api

## Utils

# Show project statistics
[group('utils')]
stats:
    @echo "📊 Project Statistics"
    @echo "===================="
    @echo "Packages: $(ls -d search | wc -l | xargs)"
    @echo "TypeScript files: $(find search/src -name '*.ts' | wc -l | xargs)"
    @echo "Total lines of code: $(find search/src -name '*.ts' -exec wc -l {} + | tail -1 | awk '{print $1}' | xargs)"
    @echo ""
    @echo "📦 Package Info:"
    @echo "  search: $(cd search && cat package.json | grep -m1 description | cut -d':' -f2 | tr -d ',' | xargs)"

# Show environment info
[group('utils')]
env-info:
    @echo "🔧 Environment Information"
    @echo "========================="
    @echo "Node version: $(node --version)"
    @echo "pnpm version: $(pnpm --version)"
    @echo "Just version: $(just --version)"
    @echo ""
    @echo "📁 Working directory: $(pwd)"
    @echo "📦 Packages: search"
