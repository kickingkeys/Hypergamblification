// Kalshi API integration for searching prediction markets

const KALSHI_API_BASE = 'https://kalshi-search-api.fly.dev';
const KALSHI_MARKET_BASE = 'https://kalshi.com/markets';

export interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  status: string;
  yes_price: number;
  no_price: number;
  volume: number;
  close_time: string;
  event_ticker: string;
  url: string; // Direct URL to market page (added by Sean)
  series?: {
    ticker: string;
    title: string;
    category: string;
    tags: string[];
    url?: string;
  };
}

export interface SearchResult {
  markets: KalshiMarket[];
  series_matched: number;
  total: number;
  query: string;
  timing: {
    total_ms: number;
    series_search_ms: number;
    api_fetch_ms: number;
  };
}

// Simple cache for market search results (5 minute TTL)
const marketCache = new Map<string, { markets: KalshiMarket[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Search for markets by keyword
 */
export async function searchMarkets(
  query: string,
  options: { limit?: number; status?: 'open' | 'closed' } = {}
): Promise<KalshiMarket[]> {
  const { limit = 5, status = 'open' } = options;

  // Check cache first
  const cacheKey = `${query}-${status}-${limit}`;
  const cached = marketCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[KALSHI-API] 💾 Cache hit for "${query}"`);
    return cached.markets;
  }

  console.log(`[KALSHI-API] 🔍 Searching for "${query}"...`);

  try {
    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
      status
    });

    const response = await fetch(`${KALSHI_API_BASE}/api/v1/markets/search?${params}`);

    if (!response.ok) {
      throw new Error(`Kalshi API error: ${response.status}`);
    }

    const result: SearchResult = await response.json();

    console.log(`[KALSHI-API] ✅ Found ${result.markets.length} markets for "${query}" (${result.timing.total_ms}ms)`);

    // Cache results
    marketCache.set(cacheKey, {
      markets: result.markets,
      timestamp: Date.now()
    });

    return result.markets;
  } catch (error) {
    console.error(`[KALSHI-API] ❌ Search failed for "${query}":`, error);
    return [];
  }
}

/**
 * Find the best matching market from multiple keyword searches
 */
export async function findBestMarket(keywords: string[]): Promise<KalshiMarket | null> {
  console.log(`[KALSHI-API] 🎯 Finding best market for keywords:`, keywords);

  // Search top 5 keywords (balance relevance vs API calls)
  const topKeywords = keywords.slice(0, 5);

  // Search all keywords in parallel with higher limit
  const searchPromises = topKeywords.map(keyword => searchMarkets(keyword, { limit: 5 }));
  const results = await Promise.all(searchPromises);

  // Flatten all markets into one array
  const allMarkets: Array<{ market: KalshiMarket; matchCount: number; keywordIndex: number }> = [];

  results.forEach((markets, keywordIndex) => {
    markets.forEach(market => {
      // Check if we already have this market (deduplication)
      const existing = allMarkets.find(m => m.market.ticker === market.ticker);

      if (existing) {
        // Same market matched multiple keywords - increase its score
        existing.matchCount++;
      } else {
        // New market
        allMarkets.push({
          market,
          matchCount: 1,
          keywordIndex // Earlier keywords are more important
        });
      }
    });
  });

  if (allMarkets.length === 0) {
    console.log('[KALSHI-API] ⚠️ No markets found for any keywords');
    return null;
  }

  // Sort by:
  // 1. Match count (markets that match multiple keywords are better)
  // 2. Keyword index (earlier keywords are more relevant)
  // 3. Volume (more popular markets are better)
  allMarkets.sort((a, b) => {
    if (a.matchCount !== b.matchCount) {
      return b.matchCount - a.matchCount; // Higher match count first
    }
    if (a.keywordIndex !== b.keywordIndex) {
      return a.keywordIndex - b.keywordIndex; // Earlier keywords first
    }
    return b.market.volume - a.market.volume; // Higher volume first
  });

  const bestMarket = allMarkets[0].market;
  console.log(`[KALSHI-API] 🏆 Best market: "${bestMarket.title}" (${bestMarket.ticker})`);

  return bestMarket;
}

/**
 * Get the URL for a market on Kalshi
 * Now using the url field directly from Sean's API
 */
export function getMarketUrl(market: KalshiMarket): string {
  return market.url;
}

/**
 * Format price as percentage
 */
export function formatPrice(cents: number): string {
  return `${cents}%`;
}

/**
 * Format volume in dollars
 */
export function formatVolume(cents: number): string {
  const dollars = cents / 100;

  if (dollars >= 1000000) {
    return `$${(dollars / 1000000).toFixed(1)}M`;
  }
  if (dollars >= 1000) {
    return `$${(dollars / 1000).toFixed(0)}K`;
  }
  return `$${dollars.toFixed(0)}`;
}

/**
 * Format close time
 */
export function formatCloseTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();

  // Calculate days until close
  const daysUntil = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) {
    return 'Closed';
  }
  if (daysUntil === 0) {
    return 'Closes today';
  }
  if (daysUntil === 1) {
    return 'Closes tomorrow';
  }
  if (daysUntil < 30) {
    return `Closes in ${daysUntil}d`;
  }

  // Format as "Jan 2026"
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
