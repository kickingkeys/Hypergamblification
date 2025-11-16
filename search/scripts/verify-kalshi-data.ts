#!/usr/bin/env tsx
/**
 * Verify Kalshi data size and API performance
 * Run this BEFORE deciding on architecture
 *
 * Usage: tsx scripts/verify-kalshi-data.ts
 */
import 'dotenv/config';
import { KalshiClient } from '../src/indexer/kalshi-client.js';

async function verifyAssumptions() {
  const client = new KalshiClient();
  const startTime = Date.now();

  console.log('🔍 Verifying Kalshi API characteristics...\n');
  console.log('=' .repeat(60));

  // 1. Count Series
  console.log('\n📊 SERIES');
  console.log('-'.repeat(60));
  const seriesStart = Date.now();
  try {
    const seriesResp = await client.getSeries();
    const seriesCount = seriesResp.series?.length ?? 0;
    const seriesTime = Date.now() - seriesStart;

    console.log(`✓ Series count: ${seriesCount}`);
    console.log(`✓ Fetch time: ${seriesTime}ms`);
    console.log(`✓ Has cursor: ${!!seriesResp.cursor}`);
    console.log(`✓ API supports pagination: ${seriesResp.cursor ? 'YES (but returned all in one call)' : 'NO'}`);

    if (seriesResp.series && seriesResp.series.length > 0) {
      console.log('\n  Sample series:');
      console.log('  ', JSON.stringify(seriesResp.series[0], null, 2).split('\n').join('\n  '));
    }
  } catch (error) {
    console.error('❌ Failed to fetch series:', error);
  }

  // 2. Sample Events
  console.log('\n📅 EVENTS');
  console.log('-'.repeat(60));
  const eventsStart = Date.now();
  try {
    const eventsResp = await client.getEvents({ limit: 100, status: 'open' });
    const eventsCount = eventsResp.events?.length ?? 0;
    const eventsTime = Date.now() - eventsStart;

    console.log(`✓ Events fetched (limit=100, status=open): ${eventsCount}`);
    console.log(`✓ Fetch time: ${eventsTime}ms`);
    console.log(`✓ Has more pages: ${!!eventsResp.cursor}`);

    if (eventsResp.events && eventsResp.events.length > 0) {
      console.log('\n  Sample event:');
      console.log('  ', JSON.stringify(eventsResp.events[0], null, 2).split('\n').join('\n  '));

      // Check if events have unique data
      const event = eventsResp.events[0];
      console.log('\n  Event metadata check:');
      console.log(`    - Has title: ${!!event.title}`);
      console.log(`    - Has series_ticker: ${!!event.series_ticker}`);
      console.log(`    - Has event_ticker: ${!!event.event_ticker}`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch events:', error);
  }

  // 3. Sample Markets (open only)
  console.log('\n🎯 MARKETS (OPEN)');
  console.log('-'.repeat(60));
  const marketsStart = Date.now();
  try {
    const marketsResp = await client.getMarkets({ limit: 100, status: 'open' });
    const marketsCount = marketsResp.markets?.length ?? 0;
    const marketsTime = Date.now() - marketsStart;

    console.log(`✓ Markets fetched (limit=100, status=open): ${marketsCount}`);
    console.log(`✓ Fetch time: ${marketsTime}ms`);
    console.log(`✓ Has more pages: ${!!marketsResp.cursor}`);

    if (marketsResp.markets && marketsResp.markets.length > 0) {
      console.log('\n  Sample market:');
      console.log('  ', JSON.stringify(marketsResp.markets[0], null, 2).split('\n').join('\n  '));

      // Check market metadata
      const market = marketsResp.markets[0];
      console.log('\n  Market metadata check:');
      console.log(`    - Has title: ${!!market.title}`);
      console.log(`    - Has series_ticker: ${!!market.series_ticker}`);
      console.log(`    - Has event_ticker: ${!!market.event_ticker}`);
      console.log(`    - Has close_time: ${!!market.close_time}`);
      console.log(`    - Has status: ${!!market.status}`);
      console.log(`    - Has volume: ${market.volume !== undefined}`);
      console.log(`    - Has yes_bid: ${market.yes_bid !== undefined}`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch markets:', error);
  }

  // 4. Count ALL open markets (with early exit)
  console.log('\n📈 COUNTING ALL OPEN MARKETS');
  console.log('-'.repeat(60));
  console.log('(This may take a while, fetching in batches of 1000...)');

  let totalOpenMarkets = 0;
  let cursor: string | undefined = undefined;
  let iterations = 0;
  const maxIterations = 100; // Safety limit
  const countStart = Date.now();

  try {
    while (iterations < maxIterations) {
      const batch = await client.getMarkets({ limit: 1000, cursor, status: 'open' });
      const batchSize = batch.markets?.length ?? 0;
      totalOpenMarkets += batchSize;

      if (iterations % 5 === 0) {
        console.log(`  ... ${totalOpenMarkets} markets so far (${iterations + 1} requests, ${Date.now() - countStart}ms)`);
      }

      if (!batch.cursor || batchSize === 0) {
        console.log(`  ✓ Finished! No more pages.`);
        break;
      }

      cursor = batch.cursor;
      iterations++;
    }

    const countTime = Date.now() - countStart;
    console.log(`\n✓ Total open markets: ${totalOpenMarkets}`);
    console.log(`✓ Total API requests: ${iterations + 1}`);
    console.log(`✓ Total time: ${(countTime / 1000).toFixed(2)}s`);
    console.log(`✓ Avg time per request: ${(countTime / (iterations + 1)).toFixed(0)}ms`);

    if (iterations >= maxIterations) {
      console.log(`\n⚠️  Hit safety limit of ${maxIterations} requests`);
      console.log(`   Actual total may be higher than ${totalOpenMarkets}`);
    }
  } catch (error) {
    console.error('❌ Failed during market counting:', error);
  }

  // 5. Try fetching ALL markets (not just open)
  console.log('\n📊 SAMPLING ALL MARKETS (any status)');
  console.log('-'.repeat(60));
  try {
    const allMarketsResp = await client.getMarkets({ limit: 1000 });
    const allMarketsCount = allMarketsResp.markets?.length ?? 0;
    console.log(`✓ All markets (limit=1000): ${allMarketsCount}`);
    console.log(`✓ Has more: ${!!allMarketsResp.cursor}`);

    if (allMarketsResp.markets) {
      const statuses = new Map<string, number>();
      allMarketsResp.markets.forEach(m => {
        const status = m.status ?? 'unknown';
        statuses.set(status, (statuses.get(status) ?? 0) + 1);
      });

      console.log('\n  Status breakdown (sample):');
      statuses.forEach((count, status) => {
        console.log(`    ${status}: ${count} (${((count / allMarketsCount) * 100).toFixed(1)}%)`);
      });
    }
  } catch (error) {
    console.error('❌ Failed to fetch all markets:', error);
  }

  // 6. Test search speed
  console.log('\n🔍 SEARCH PERFORMANCE TEST');
  console.log('-'.repeat(60));
  const searchTerms = ['bitcoin', 'trump', 'election', 'AI'];

  for (const term of searchTerms) {
    try {
      const searchStart = Date.now();
      // Note: Kalshi API might not support text search directly
      // We're testing by fetching and filtering client-side
      const results = await client.getMarkets({ limit: 100, status: 'open' });
      const filtered = results.markets?.filter(m =>
        m.title?.toLowerCase().includes(term.toLowerCase())
      ) ?? [];
      const searchTime = Date.now() - searchStart;

      console.log(`  "${term}": ${filtered.length} matches in ${searchTime}ms (client-side filter)`);
    } catch (error) {
      console.log(`  "${term}": Failed - ${error}`);
    }
  }

  // 7. Summary
  const totalTime = Date.now() - startTime;
  console.log('\n' + '='.repeat(60));
  console.log('📋 SUMMARY & RECOMMENDATIONS');
  console.log('='.repeat(60));

  console.log('\nEstimated data size:');
  console.log(`  Series:  ~200-500 records (API doesn't paginate)`);
  console.log(`  Events:  Unknown (would need full count)`);
  console.log(`  Markets: ~${totalOpenMarkets} OPEN markets`);
  console.log(`           (Unknown total including closed/settled)`);

  console.log(`\nTotal verification time: ${(totalTime / 1000).toFixed(2)}s`);

  // Architecture recommendations
  console.log('\n💡 ARCHITECTURAL RECOMMENDATIONS:\n');

  if (totalOpenMarkets < 1000) {
    console.log('✅ RECOMMENDATION: In-Memory Cache');
    console.log('   Reasons:');
    console.log(`   - Very small dataset (${totalOpenMarkets} open markets)`);
    console.log('   - Can fetch all data in <5 seconds');
    console.log('   - No need for PostgreSQL complexity');
    console.log('   - Refresh every 5-10 minutes via setInterval');
    console.log('\n   Architecture:');
    console.log('   1. Fetch all series/markets on startup');
    console.log('   2. Store in memory (Map/Array)');
    console.log('   3. Implement search with simple JS .filter()');
    console.log('   4. Refresh periodically');
    console.log('   5. Add Redis for distributed caching (optional)');
  } else if (totalOpenMarkets < 10000) {
    console.log('✅ RECOMMENDATION: Hybrid Approach');
    console.log('   Reasons:');
    console.log(`   - Medium dataset (${totalOpenMarkets} markets)`);
    console.log('   - PostgreSQL useful but not strictly necessary');
    console.log('\n   Options:');
    console.log('   A. In-memory with Redis cache (simpler)');
    console.log('   B. PostgreSQL with full indexing (current, more scalable)');
    console.log('\n   Simplification opportunity:');
    console.log('   - Skip Events table if event.title ≈ market.title');
    console.log('   - Just use Series → Markets');
  } else {
    console.log('✅ RECOMMENDATION: Keep PostgreSQL');
    console.log('   Reasons:');
    console.log(`   - Large dataset (${totalOpenMarkets}+ markets)`);
    console.log('   - Full-text search needed');
    console.log('   - Indexing pipeline justified');
  }

  console.log('\n🎯 NEXT STEPS:\n');
  console.log('1. Review sample data structures above');
  console.log('2. Check if event.title adds value over market.title');
  console.log('3. Decide: Keep 3 tables or flatten to 2?');
  console.log('4. If dataset is small, consider ditching PostgreSQL entirely');
  console.log('5. Test actual Kalshi search API (if it exists)');

  console.log('\n' + '='.repeat(60));
}

verifyAssumptions()
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
