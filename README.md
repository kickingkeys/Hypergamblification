# Hypergamblification

A dystopian browser extension that demonstrates algorithmic manipulation by injecting prediction market betting opportunities based on what users see on their screen.

## Project Structure

This is a monorepo containing two main components:

```
hypergamblification/
├── search/              # Backend: Kalshi Search API
│   └── ...             # High-performance search service
├── extension/          # Frontend: Chrome Extension
│   ├── src/            # Extension source code
│   ├── public/         # Static assets
│   └── package.json    # Extension dependencies
└── package.json        # Root monorepo config
```

## Components

### 1. Chrome Extension (`extension/`)

A browser extension that:
- Tracks images in the viewport using IntersectionObserver
- Uses GPT-4o-mini vision API for multi-modal context extraction
- Matches content to prediction markets via Kalshi API
- Displays betting opportunities as overlay cards

**Tech Stack:**
- Chrome Manifest V3, TypeScript
- GPT-4o-mini Vision API
- Tesseract.js OCR
- Webpack build system

**Quick Start:**
```bash
cd extension
npm install
npm run build

# Load in Chrome:
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select extension/dist/
```

See [extension/REQUIREMENTS.md](extension/REQUIREMENTS.md) for detailed setup.

### 2. Kalshi Search API (`search/`)

A high-performance search service for Kalshi prediction markets:
- Full-text search with PostgreSQL GIN indexes
- Automatic data sync from Kalshi API
- REST API with Hono framework
- Deployed on Fly.io at https://kalshi-search-api.fly.dev

**Tech Stack:**
- Node.js 20+, TypeScript
- Hono web framework
- PostgreSQL with Kysely
- Fly.io deployment

**Quick Start:**
```bash
cd search
pnpm install
just dev                # Start development server
```

See [search/README.md](search/README.md) for detailed backend documentation.

## The Concept

This is a **critical art/tech piece** highlighting:
- The potential for algorithmic manipulation
- The gamification of information consumption
- A dystopian future where every topic becomes a betting opportunity
- The slippery slope of prediction markets meeting content consumption

## User Flow

1. User browses the web normally
2. Extension detects images in viewport
3. Prioritizes images closest to user's view (distance-based queue)
4. Captures screenshot + surrounding text context
5. Sends to GPT-4o-mini for keyword extraction
6. Searches Kalshi for matching prediction markets
7. Displays betting opportunities as overlay cards

**Example:**

User is reading: "Bitcoin just hit $95,000 as crypto market surges"

Extension shows overlay:
```
💰 Kalshi Market Match
"Will Bitcoin be above $100k by Dec 31, 2025?"
Yes: 45¢ | No: 55¢ | Volume: $1.2M
[View on Kalshi →]
```

## Features

- ✅ Viewport-aware priority queue (process closest images first)
- ✅ Rate limiting (8 concurrent API calls)
- ✅ Staleness checks (skip images user scrolled past)
- ✅ Multi-modal keyword extraction (image + text context)
- ✅ Market matching with relevance ranking
- ✅ Beautiful overlay cards with market data
- ✅ High-performance in-memory search API

## API Keys Needed

1. **OpenAI API Key** - https://platform.openai.com/api-keys
2. **Kalshi API Credentials** - https://kalshi.com (Account Settings → API)

## Development

**Extension:**
```bash
cd extension
npm install
npm run dev              # Watch mode
```

**Search API:**
```bash
cd search
pnpm install
just dev                 # Start all services with mprocs
```

## Cost Estimate

- **OpenAI (GPT-4o-mini):** ~$0.25-1/month per active user
- **Kalshi API:** FREE (read-only access)
- **Tesseract.js:** FREE (runs in browser)

**Total: ~$0.25-1/month per user** (very cheap!)

## The Message

**This is NOT meant to:**
- Actually promote gambling
- Exploit users
- Generate profit from betting

**This IS meant to:**
- Highlight algorithmic manipulation potential
- Critique hyper-gamification of information
- Demonstrate dystopian content consumption futures

## License

MIT

---

**Warning**: This is a critical/satirical project meant to highlight algorithmic manipulation. Use responsibly.
