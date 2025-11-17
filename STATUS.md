# Project Status

**Last Updated:** Nov 15, 2024

## Current State

The Hypergamblification Chrome extension is **functionally complete** with the following features working:

### ✅ Completed Features
1. **Viewport Tracking** - IntersectionObserver detects images in viewport
2. **Priority Queue** - Distance-based prioritization (closest images first)
3. **Rate Limiting** - 8 concurrent API calls max to avoid OpenAI rate limits
4. **Multi-modal Keyword Extraction** - GPT-4o-mini vision + text context
5. **Market Search** - Uses Sean's Kalshi Search API
6. **Market Cards** - Beautiful overlay cards with market data
7. **Clickable Links** - Opens correct Kalshi market pages (fixed with Sean's `url` field)
8. **Staleness Checks** - Skips images user scrolled past

### 🔧 How to Build & Run

```bash
# Build extension
cd extension
npm install
npm run build

# Load in Chrome
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select: extension/dist/

# Add OpenAI API key
# Click extension icon → Enter API key → Save
```

### ⚠️ Known Issues

1. **API Key Lost on Reload** - When reinstalling extension, need to re-enter OpenAI key
2. **Market Matching** - BBC News topics often don't match Kalshi markets (expected - not all news has prediction markets)

### 🚧 Next Steps / TODO

1. **Improve Keyword Extraction Prompt** - Extract hierarchical keywords:
   - Category (Politics/Sports/Economics/etc)
   - Broad terms (election, championship, stock price)
   - Specific entities (Trump, Lakers, Bitcoin)
   - See discussion in `extension/src/lib/llm.ts:66-76`

2. **Better Market Coverage** - Current prompt extracts too-specific news keywords like "Hitler DNA research" which don't have markets. Need to extract more "predictable" topics.

3. **Testing** - Works great on NYT, less well on BBC News

## Architecture

```
hypergamblification-repo/
├── search/                          # Sean's Kalshi Search API (backend)
│   └── [PostgreSQL + Hono API]
├── extension/                       # Chrome Extension (frontend)
│   ├── src/
│   │   ├── background/              # Service worker
│   │   │   └── background.ts        # Message handling, API proxying
│   │   ├── content/                 # Content script
│   │   │   ├── content.ts           # Main entry point
│   │   │   └── mouse-tracker.ts     # Mouse position tracking
│   │   ├── lib/
│   │   │   ├── viewport-tracker.ts  # ⭐ Core viewport tracking + priority queue
│   │   │   ├── llm.ts              # GPT-4o-mini vision API calls
│   │   │   ├── kalshi-api.ts       # Market search via Sean's API
│   │   │   ├── ocr.ts              # Tesseract.js (unused now)
│   │   │   └── types.ts            # TypeScript types
│   │   └── popup/
│   │       └── popup.ts            # Extension settings popup
│   ├── public/
│   │   ├── manifest.json           # Chrome Extension manifest
│   │   └── popup.html              # Popup UI
│   └── dist/                       # Build output (load this in Chrome)
└── README.md
```

## Key Files to Know

### `extension/src/lib/viewport-tracker.ts`
**The heart of the system.** Handles:
- IntersectionObserver setup
- Priority queue management (Euclidean distance from viewport center)
- Rate limiting (maxConcurrent = 8)
- Image context extraction (alt, caption, headline, nearby text)
- Market card rendering
- Staleness checks

**Key Methods:**
- `start()` - Initializes tracking
- `handleIntersection()` - Detects images entering viewport
- `calculatePriority()` - Euclidean distance from viewport center
- `processQueue()` - Async queue processor with rate limiting
- `processImage()` - Main processing logic per image
- `createMarketCard()` - Renders overlay card

### `extension/src/lib/llm.ts`
**Keyword extraction via GPT-4o-mini vision.**

Current prompt (lines 66-76):
```typescript
const prompt = `Analyze this image with its surrounding context to extract prediction market keywords.

CONTEXT:
${contextString}

IMAGE: See below

Extract 3-5 specific keywords that could match prediction markets (politics, sports, economics, events, etc.).
Focus on concrete, searchable terms.

Return ONLY a JSON array. Example: ["Biden election", "climate summit", "tech regulation"]`;
```

**TODO:** Make this extract hierarchical keywords (category → broad → specific) for better market matching.

### `extension/src/lib/kalshi-api.ts`
**Interfaces with Sean's search API.**

Key functions:
- `searchMarkets(query, options)` - Search for markets
- `findBestMarket(keywords[])` - Takes top 3 keywords, searches each, deduplicates, ranks by match count + volume
- `getMarketUrl(market)` - Returns `market.url` from Sean's API

### `extension/src/background/background.ts`
**Service worker message handler.**

Handles messages:
- `CAPTURE_SCREENSHOT` - Chrome API for screenshots
- `EXTRACT_TEXT` - OCR (unused now)
- `EXTRACT_KEYWORDS` - Legacy text-based (unused)
- `EXTRACT_KEYWORDS_FROM_IMAGE` - Vision-only (unused)
- `EXTRACT_KEYWORDS_WITH_CONTEXT` - ⭐ Current method (image + text + market search)
- `SAVE_OPENAI_KEY` - Store API key

## Environment Variables

Create `extension/.env` (not committed):
```env
# Required
OPENAI_API_KEY=sk-...

# Optional - Kalshi credentials (not needed for read-only search)
KALSHI_API_KEY_ID=...
KALSHI_PRIVATE_KEY_PATH=...
```

**Note:** API key is stored in Chrome's `chrome.storage.local`, not .env file.

## Dependencies

**Extension:**
- `openai` - GPT-4o-mini vision API
- `tesseract.js` - OCR (unused but installed)
- Webpack + TypeScript

**Search API (Sean's):**
- See `search/README.md`

## Sean's API

**Base URL:** `https://kalshi-search-api.fly.dev`

**Key Endpoint:**
```
GET /api/v1/markets/search?q={query}&limit=5
```

**Response includes:**
```json
{
  "ticker": "KXBTC-...",
  "title": "Will Bitcoin...",
  "url": "https://kalshi.com/markets/...",  // ⭐ Direct URL
  "yes_price": 45,
  "no_price": 55,
  "volume": 1234567,
  "close_time": "2026-01-01T00:00:00Z",
  "series": { ... }
}
```

See `Downloads/Seans API documentation.txt` for full API docs.

## Testing

**Works well on:**
- New York Times (nyt.com)
- News sites with clear headlines + images

**Works poorly on:**
- BBC News (topics too specific, no matching markets)
- Sites with generic images

**How to test:**
1. Press Cmd+Shift+A (Mac) or Ctrl+Shift+A (Windows)
2. Extension starts tracking images in viewport
3. Processes closest images first (priority queue)
4. Market cards appear on successful matches
5. Click card to open Kalshi market page

**Console logs:**
```
[VIEWPORT-TRACKER] 🚀 Starting viewport tracking...
[VIEWPORT-TRACKER] 📸 Found 14 images to track
[VIEWPORT-TRACKER] 👁️ Image entered viewport (priority: 68px)
[VIEWPORT-TRACKER] 🔄 Processing (3/8 active)
[VIEWPORT-TRACKER] ✅ Keywords extracted: ["trump", "election", "2024"]
[VIEWPORT-TRACKER] 🏆 Market found: "Will Trump win 2024?"
```

## Rate Limits

**OpenAI:**
- Model: `gpt-4o-mini`
- Cost: ~$0.00025 per image analysis
- Rate limit: 200k tokens/min (usually fine with 8 concurrent)

**Kalshi Search API:**
- No rate limits currently
- Cache: 5 minutes TTL

## Git Workflow

```bash
# Current branch: main
# Remote: github.com:kickingkeys/Hypergamblification

# To commit changes:
git add extension/src/...
git commit -m "Description"
git push origin main
```

## Questions?

- Check `extension/REQUIREMENTS.md` for detailed setup
- Check `extension/MVP_BUILD_PLAN.md` for original planning docs
- Check `search/README.md` for backend API docs
