# Kalshi Search Service

A high-performance search service for Kalshi prediction markets with an indexing pipeline, built with TypeScript, Kysely, PostgreSQL, and deployed on Fly.io.

## Architecture

- **Search API**: Hono-based REST API with full-text search capabilities
- **Indexing Pipeline**: Scheduled jobs that sync data from Kalshi API
- **Database**: PostgreSQL with GIN indexes for fast full-text search
- **Infrastructure**: Fully deployed on Fly.io

## Features

- 🔍 Full-text search across markets, events, and series
- 📊 Advanced filtering by status, category, volume
- 🔄 Automatic data synchronization from Kalshi API
- 📄 Cursor-based pagination for large result sets
- 🚀 High-performance PostgreSQL GIN indexes
- 🔒 Type-safe database queries with Kysely
- 📦 Lightweight Hono web framework

## Prerequisites

- Node.js 20+
- pnpm (package manager)
- Fly.io CLI (`flyctl`)
- Kalshi API credentials
- (Optional) just - for convenience commands

## Quick Start

**First time?** → See [QUICKSTART.md](./QUICKSTART.md) for a 5-minute setup guide!

**TL;DR:**
```bash
pnpm install                    # Install dependencies
flyctl wireguard create         # Set up VPN (one-time)
just migrate                    # Run database migrations
just sync-all                   # Sync initial data (needs Kalshi credentials)
just dev                        # Start development server
```

**Show all commands:**
```bash
just                            # Show all available commands
just --list                     # List all recipes
```

**More documentation:**
- [QUICKSTART.md](./QUICKSTART.md) - 5-minute quick start
- [SETUP.md](./SETUP.md) - Detailed step-by-step setup
- [PLAN.md](./PLAN.md) - Architecture and design

## Local Development

### 1. Clone and Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
KALSHI_API_KEY=your-api-key
KALSHI_PRIVATE_KEY_PATH=/path/to/private-key.pem
```

### 3. Set Up WireGuard (One-time setup)

For local database access, you need WireGuard:

```bash
flyctl wireguard create
```

Follow the prompts to set up the VPN connection.

### 4. Run Database Migrations

```bash
# Start the database proxy in a terminal
pnpm run proxy:db

# In another terminal, run migrations
pnpm run migrate:latest
```

### 5. Sync Initial Data

```bash
# Sync all resources
pnpm run sync:all

# Or sync individually
pnpm run sync:series
pnpm run sync:events
pnpm run sync:markets
```

### 6. Start Development Server (Recommended)

Use `just dev` to start all services with mprocs:

```bash
just dev
```

This starts:
- 🗄️ Database proxy
- 🚀 API server
- 🔍 TypeScript type checking

**mprocs keyboard shortcuts:**
- `↑/↓` or `j/k` - Navigate between processes
- `Enter` - Focus on a process
- `Esc` - Return to overview
- `q` - Quit all processes

**Options:**
```bash
just dev-indexer           # Also run indexer for testing
./dev.sh --skip-proxy      # Skip database proxy (if already running)
./dev.sh --help            # Show all dev.sh options
```

### 6b. Manual Start (Alternative)

Or start services individually in separate terminals:

```bash
# Terminal 1: Database proxy
just proxy

# Terminal 2: API server
just api

# Terminal 3: Type checking (optional)
just typecheck-watch
```

The API will be available at `http://localhost:3000`

> **Note**: `just dev` must be run in an interactive terminal. Use `↑/↓` to navigate processes, `Enter` to focus, `q` to quit.

## API Endpoints

### Health Check
```
GET /health
```

### Markets

**Search Markets**
```
GET /api/v1/markets/search?q=election&status=open&limit=20
```

Query Parameters:
- `q` - Search query
- `status` - Market status (open, closed, settled, etc.)
- `series_ticker` - Filter by series
- `event_ticker` - Filter by event
- `category` - Filter by category
- `min_volume` - Minimum volume
- `sort_by` - Sort by (relevance, volume, close_time)
- `sort_order` - Sort order (asc, desc)
- `limit` - Results per page (max 200)
- `cursor` - Pagination cursor

**Get Market Details**
```
GET /api/v1/markets/:ticker
```

### Events

**Search Events**
```
GET /api/v1/events/search?q=election&series_ticker=PRES
```

### Series

**List Series**
```
GET /api/v1/series?category=politics
```

## Deployment

### 1. Create Fly.io Apps

The database is already created. Create the API and indexer apps:

```bash
# Create API app
flyctl apps create kalshi-search-api --org personal

# Create indexer app
flyctl apps create kalshi-search-indexer --org personal
```

### 2. Attach Database to Apps

```bash
flyctl postgres attach kalshi-search-db --app kalshi-search-api
flyctl postgres attach kalshi-search-db --app kalshi-search-indexer
```

### 3. Set Secrets

```bash
# For API
flyctl secrets set \
  KALSHI_API_KEY=your-key \
  KALSHI_PRIVATE_KEY="$(cat private-key.pem)" \
  --app kalshi-search-api

# For indexer
flyctl secrets set \
  KALSHI_API_KEY=your-key \
  KALSHI_PRIVATE_KEY="$(cat private-key.pem)" \
  --app kalshi-search-indexer
```

### 4. Deploy Applications

```bash
# Deploy API
flyctl deploy --config fly.toml --app kalshi-search-api

# Deploy indexer
flyctl deploy --config fly.indexer.toml --app kalshi-search-indexer
```

### 5. Set Up Cron Jobs (Choose One)

**Option A: Cron Manager (Recommended)**

See `schedules.json` for cron schedule configuration.

**Option B: Supercronic**

The `crontab.txt` file contains the schedule. Deploy with a modified Dockerfile that runs supercronic.

## Project Structure

```
kalshi-search-service/
├── src/
│   ├── api/              # Hono REST API
│   │   ├── controllers/  # Request handlers
│   │   ├── middleware/   # HTTP middleware
│   │   └── server.ts     # API server
│   ├── indexer/          # Data sync pipeline
│   │   ├── kalshi-client.ts
│   │   ├── market-sync.ts
│   │   ├── event-sync.ts
│   │   ├── series-sync.ts
│   │   └── index.ts
│   ├── database/         # Database layer
│   │   ├── migrations/   # SQL migrations
│   │   ├── types.ts      # TypeScript types
│   │   └── index.ts      # Kysely client
│   └── shared/           # Shared utilities
│       ├── config.ts
│       └── logger.ts
├── fly.toml              # API deployment config
├── fly.indexer.toml      # Indexer deployment config
├── Dockerfile
├── package.json
└── README.md
```

## Database Schema

### Tables

- **series**: Market series (templates)
- **events**: Specific event instances
- **markets**: Individual tradeable outcomes
- **sync_metadata**: Indexing pipeline metadata

All tables include GIN indexes for full-text search.

## Common Commands

Development:
- `just dev` - Start development server (mprocs)
- `just api` - Start API server only
- `just proxy` - Start database proxy only
- `just typecheck` - Run TypeScript type checking

Database:
- `just migrate` - Run database migrations
- `just db-console` - Connect to database via psql
- `just db-count-markets` - Count markets in database

Sync Data:
- `just sync-all` - Sync all resources from Kalshi
- `just sync-markets` - Sync markets only
- `just sync-events` - Sync events only
- `just sync-series` - Sync series only

Deployment:
- `just deploy-api` - Deploy API to Fly.io
- `just deploy-indexer` - Deploy indexer to Fly.io
- `just deploy-all` - Deploy everything

Utilities:
- `just test-health` - Test health endpoint
- `just test-search "query"` - Test search endpoint
- `just logs-api` - View API logs
- `just stats` - Show project statistics

Run `just` or `just --list` to see all available commands.

## Technology Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Web Framework**: Hono (lightweight, fast)
- **Database**: PostgreSQL with Fly Postgres
- **Query Builder**: Kysely (type-safe SQL)
- **API Client**: kalshi-typescript (official SDK)
- **Validation**: Zod
- **Logging**: Pino
- **Deployment**: Fly.io

## License

MIT

