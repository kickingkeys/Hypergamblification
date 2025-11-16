#!/bin/sh

# Development script for Kalshi Search Service
#
# Usage: ./dev.sh [OPTIONS]
#
# Options:
#   --skip-proxy       Skip starting the database proxy (if already running)
#   --skip-api         Skip starting the API server
#   --run-indexer      Run the indexer sync service
#   --help             Show this help message
#
# Examples:
#   ./dev.sh                    # Start database proxy + API server
#   ./dev.sh --run-indexer      # Also run indexer for testing
#   ./dev.sh --skip-proxy       # Only start API (proxy already running)

# Parse command line arguments
SKIP_PROXY=false
SKIP_API=false
RUN_INDEXER=false

for arg in "$@"; do
  case "$arg" in
    --skip-proxy)
      SKIP_PROXY=true
      ;;
    --skip-api)
      SKIP_API=true
      ;;
    --run-indexer)
      RUN_INDEXER=true
      ;;
    --help)
      echo "Development script for Kalshi Search Service"
      echo ""
      echo "Usage: ./dev.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --skip-proxy       Skip starting the database proxy (if already running)"
      echo "  --skip-api         Skip starting the API server"
      echo "  --run-indexer      Run the indexer sync service"
      echo "  --help             Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./dev.sh                    # Start database proxy + API server"
      echo "  ./dev.sh --run-indexer      # Also run indexer for testing"
      echo "  ./dev.sh --skip-proxy       # Only start API (proxy already running)"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Run ./dev.sh --help for usage information"
      exit 1
      ;;
  esac
done

# Build the commands list based on flags
COMMANDS=()

# Database proxy (connects to Fly Postgres)
if [ "$SKIP_PROXY" = false ]; then
  COMMANDS+=('(echo "🗄️  Database Proxy"; flyctl proxy 5432 -a kalshi-search-db)')
fi

# API server
if [ "$SKIP_API" = false ]; then
  COMMANDS+=('(echo "🚀 API Server"; pnpm run dev:api)')
fi

# Optional: Indexer service for testing
if [ "$RUN_INDEXER" = true ]; then
  COMMANDS+=('(echo "🔄 Indexer (test mode)"; while true; do echo "Running sync..."; TASK_TYPE=sync_markets pnpm run dev:indexer; sleep 300; done)')
fi

# TypeScript type checking in watch mode
COMMANDS+=('(echo "🔍 TypeScript"; pnpm exec tsc --noEmit --watch)')

# Placeholder for future services
COMMANDS+=('(echo "xxxxxx")')

# Check if we have any commands to run
if [ ${#COMMANDS[@]} -eq 0 ]; then
  echo "No services to start. Use --help for options."
  exit 1
fi

# Run all commands with mprocs
pnpx mprocs@0.7.1 --config mprocs.yml "${COMMANDS[@]}"
