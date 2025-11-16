import { type Context } from 'hono';
import { z } from 'zod';
import { logger } from '../../shared/logger.js';
import { seriesCache } from '../../search/series-cache.js';
import { KalshiClient } from '../../indexer/kalshi-client.js';

/**
 * Query schema for hybrid market search
 */
export const searchMarketsSchema = z.object({
  q: z.string().min(1, 'Query required'),
  status: z.enum(['open', 'closed']).default('open'),
  limit: z.coerce.number().min(1).max(100).default(20),
  series_limit: z.coerce.number().min(1).max(10).default(5),
});

/**
 * Hybrid market search endpoint
 *
 * Algorithm:
 * 1. Search local in-memory series cache for keyword matches (~1ms)
 * 2. Fetch markets from Kalshi API for matched series (~200ms)
 * 3. Aggregate, rank by volume, return top N (~10ms)
 *
 * Total: ~210ms with FRESH data!
 *
 * GET /api/v1/markets/search?q=bitcoin
 */
export async function searchMarkets(c: Context) {
  try {
    const query = searchMarketsSchema.parse({
      q: c.req.query('q'),
      status: c.req.query('status') ?? 'open',
      limit: c.req.query('limit') ?? '20',
      series_limit: c.req.query('series_limit') ?? '5',
    });

    const startTime = Date.now();

    // Step 1: Search in-memory series cache with multi-keyword fallback (<1ms)
    const seriesSearchStart = Date.now();
    const searchResult = seriesCache.searchEnhanced(query.q, query.series_limit);
    const matchedSeries = searchResult.series;
    const seriesSearchTime = Date.now() - seriesSearchStart;

    if (matchedSeries.length === 0) {
      return c.json({
        markets: [],
        series_matched: 0,
        total: 0,
        query: query.q,
        search_metadata: {
          keywords: searchResult.metadata.keywords,
          strategy: searchResult.metadata.searchStrategy,
        },
        message: 'No series found matching your query. Try different keywords or check the /api/v1/series endpoint.',
        timing: {
          total_ms: Date.now() - startTime,
          series_search_ms: seriesSearchTime,
          api_fetch_ms: 0,
        },
      });
    }

    // Step 2: Fetch markets from Kalshi API in parallel (~200ms)
    const kalshiClient = new KalshiClient();
    const apiStartTime = Date.now();

    const marketPromises = matchedSeries.map((s) =>
      kalshiClient
        .getMarkets({
          seriesTicker: s.ticker,
          status: query.status,
          limit: Math.ceil(query.limit / query.series_limit), // Distribute limit across series
        })
        .then((result) => ({
          series: s,
          markets: result.markets || [],
        }))
        .catch((error) => {
          logger.error(
            { error, seriesTicker: s.ticker },
            'Failed to fetch markets from Kalshi API'
          );
          return { series: s, markets: [] };
        })
    );

    const marketBatches = await Promise.all(marketPromises);
    const apiTime = Date.now() - apiStartTime;

    // Step 3: Aggregate and rank by volume (~10ms)
    const allMarkets = marketBatches
      .flatMap((batch) =>
        batch.markets.map((m) => ({
          ticker: m.ticker ?? '',
          title: m.title ?? '',
          subtitle: m.subtitle,
          status: m.status ?? '',
          yes_price: m.yes_bid, // Note: Kalshi API uses yes_bid
          no_price: m.no_bid,
          volume: m.volume ?? 0,
          close_time: m.close_time,
          event_ticker: m.event_ticker,
          series: {
            ticker: batch.series.ticker,
            title: batch.series.title,
            category: batch.series.category,
            tags: batch.series.tags,
          },
        }))
      )
      .sort((a, b) => b.volume - a.volume) // Sort by volume (most liquid first)
      .slice(0, query.limit);

    const totalTime = Date.now() - startTime;

    logger.info(
      {
        query: query.q,
        series_matched: matchedSeries.length,
        markets_returned: allMarkets.length,
        timing: {
          total_ms: totalTime,
          series_search_ms: seriesSearchTime,
          api_fetch_ms: apiTime,
        },
      },
      'Hybrid search completed'
    );

    return c.json({
      markets: allMarkets,
      series_matched: matchedSeries.length,
      total: allMarkets.length,
      query: query.q,
      search_metadata: {
        keywords: searchResult.metadata.keywords,
        strategy: searchResult.metadata.searchStrategy,
      },
      timing: {
        total_ms: totalTime,
        series_search_ms: seriesSearchTime,
        api_fetch_ms: apiTime,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Hybrid market search failed');

    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }

    return c.json({ error: 'Internal server error' }, 500);
  }
}

/**
 * Get market details from Kalshi API (always fresh!)
 * GET /api/v1/markets/:ticker
 */
export async function getMarketDetails(c: Context) {
  try {
    const ticker = c.req.param('ticker');
    const kalshiClient = new KalshiClient();

    const market = await kalshiClient.getMarket(ticker);

    if (!market) {
      return c.json({ error: 'Market not found' }, 404);
    }

    return c.json({
      ticker: market.ticker ?? '',
      title: market.title ?? '',
      subtitle: market.subtitle,
      status: market.status ?? '',
      yes_price: market.yes_bid,
      no_price: market.no_bid,
      volume: market.volume,
      close_time: market.close_time,
      expiration_time: market.expiration_time,
      event_ticker: market.event_ticker,
    });
  } catch (error) {
    logger.error(
      { error, ticker: c.req.param('ticker') },
      'Failed to get market details from Kalshi API'
    );
    return c.json({ error: 'Market not found or API error' }, 404);
  }
}
