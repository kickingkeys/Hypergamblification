#!/usr/bin/env tsx
import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { searchMarkets, getMarketDetails } from './controllers/markets.js';
import { requestLogger } from './middleware/logger.js';
import { logger } from '../shared/logger.js';
import { config, validateConfig } from '../shared/config.js';
import { seriesCache } from '../search/series-cache.js';

/**
 * Create Hono application
 */
function createApp() {
  const app = new Hono();

  // CORS middleware
  app.use('*', cors({
    origin: config.api.corsOrigin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }));

  // Request logging middleware
  app.use('*', requestLogger);

  // Health check endpoint
  app.get('/health', async (c) => {
    const cacheStats = seriesCache.getStats();

    if (!seriesCache.isLoaded()) {
      return c.json(
        {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          series_cache: 'not loaded',
          version: process.env.npm_package_version || '1.0.0',
        },
        503
      );
    }

    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      series_cache: 'loaded',
      series_count: cacheStats.count,
      cache_loaded_at: cacheStats.loadedAt,
      cache_size_mb: cacheStats.sizeMB,
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // API routes
  const api = new Hono();

  // Market search routes (hybrid: in-memory series + Kalshi API)
  api.get('/markets/search', searchMarkets);
  api.get('/markets/:ticker', getMarketDetails);

  // Series cache routes
  api.get('/series', (c) => {
    const all = seriesCache.getAll();
    return c.json({
      series: all,
      total: all.length,
      cache_stats: seriesCache.getStats(),
    });
  });

  // Admin route to reload cache without restarting
  api.post('/admin/reload-series', async (c) => {
    try {
      await seriesCache.reload();
      return c.json({ success: true, stats: seriesCache.getStats() });
    } catch (error) {
      logger.error({ error }, 'Failed to reload series cache');
      return c.json({ error: 'Failed to reload cache' }, 500);
    }
  });

  // Mount API routes
  app.route('/api/v1', api);

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    logger.error({ error: err }, 'Unhandled error');
    return c.json({
      error: 'Internal server error',
      message: config.isDevelopment ? err.message : undefined,
    }, 500);
  });

  return app;
}

/**
 * Start the server
 */
async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Load series cache (takes ~3 seconds, one-time on startup)
    logger.info('🚀 Initializing Kalshi Search API...');
    await seriesCache.load();

    // Create app
    const app = createApp();

    // Start server
    const port = config.api.port;

    logger.info({ port }, 'Starting HTTP server...');

    serve({
      fetch: app.fetch,
      port,
    });

    logger.info({ port }, `✅ Server started on http://localhost:${port}`);
    logger.info('📚 API endpoints:');
    logger.info(`  GET  /health`);
    logger.info(`  GET  /api/v1/markets/search?q=<keyword>`);
    logger.info(`  GET  /api/v1/markets/:ticker`);
    logger.info(`  GET  /api/v1/series`);
    logger.info(`  POST /api/v1/admin/reload-series`);
    logger.info('');
    logger.info(`💡 Series cache: ${seriesCache.getStats().count} series loaded (${seriesCache.getStats().sizeMB} MB)`);
  } catch (error) {
    logger.error({
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Failed to start server');
    console.error('Startup error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createApp };
