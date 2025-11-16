import { KalshiClient } from '../indexer/kalshi-client.js';
import { logger } from '../shared/logger.js';

/**
 * Series data structure for in-memory storage
 */
export interface Series {
  ticker: string;
  title: string;
  category?: string;
  tags?: string[];
  frequency?: string;
}

/**
 * Search result with relevance score
 */
interface ScoredSeries {
  series: Series;
  score: number;
  matchedKeywords?: string[];
  matchType?: 'full' | 'partial' | 'keyword';
}

/**
 * Enhanced search result with metadata
 */
export interface SearchResult {
  series: Series[];
  metadata: {
    query: string;
    keywords: string[];
    totalMatches: number;
    searchStrategy: 'full_match' | 'keyword_fallback';
  };
}

/**
 * Stop words to remove from queries
 */
const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'is', 'are', 'what', 'when', 'who', 'where',
  'why', 'how', 'be', 'to', 'of', 'and', 'or', 'in', 'on', 'at', 'for',
  'by', 'with', 'from', 'as', 'that', 'this', 'it', 'have', 'has',
]);

/**
 * In-memory series cache
 * Loads all series from Kalshi API on startup and provides fast search
 */
export class SeriesCache {
  private series: Map<string, Series> = new Map();
  private loaded: boolean = false;
  private loadedAt: Date | null = null;

  /**
   * Extract keywords from query, removing stop words
   */
  private extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
  }

  /**
   * Score a series against a single keyword
   */
  private scoreSeriesForKeyword(series: Series, keyword: string): number {
    const lowerKeyword = keyword.toLowerCase();
    let score = 0;

    // Exact tag match (highest priority)
    if (series.tags?.some((tag) => tag.toLowerCase() === lowerKeyword)) {
      score += 100;
    }

    // Partial tag match
    if (series.tags?.some((tag) => tag.toLowerCase().includes(lowerKeyword))) {
      score += 50;
    }

    // Title contains keyword
    if (series.title.toLowerCase().includes(lowerKeyword)) {
      score += 30;
      // Bonus if at the start
      if (series.title.toLowerCase().startsWith(lowerKeyword)) {
        score += 20;
      }
    }

    // Category match
    if (series.category?.toLowerCase().includes(lowerKeyword)) {
      score += 10;
    }

    return score;
  }

  /**
   * Load all series from Kalshi API
   * Call this once on application startup
   */
  async load(): Promise<void> {
    const startTime = Date.now();
    logger.info('📥 Loading series data into memory...');

    try {
      const client = new KalshiClient();
      const response = await client.getSeries();
      const seriesList = response.series || [];

      // Clear existing cache
      this.series.clear();

      // Store in map for fast lookup
      for (const s of seriesList) {
        this.series.set(s.ticker ?? '', {
          ticker: s.ticker ?? '',
          title: s.title ?? '',
          category: s.category,
          tags: (s as any).tags, // Tags might not be in SDK types but exist in API
          frequency: (s as any).frequency, // Same for frequency
        });
      }

      const loadTime = Date.now() - startTime;
      const sizeBytes = JSON.stringify(Array.from(this.series.values())).length;
      const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

      this.loaded = true;
      this.loadedAt = new Date();

      logger.info(
        {
          count: this.series.size,
          loadTimeMs: loadTime,
          sizeMB,
          loadedAt: this.loadedAt.toISOString(),
        },
        '✅ Series cache loaded successfully'
      );
    } catch (error) {
      logger.error({
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, '❌ Failed to load series cache');
      console.error('Series cache load error:', error);
      throw error;
    }
  }

  /**
   * Enhanced search with multi-keyword fallback
   *
   * Strategy:
   * 1. Try full query first (e.g., "eric trump")
   * 2. If < 3 results, break into keywords and search separately
   * 3. Score results:
   *    - Full match: score × 2.0
   *    - All keywords match: score × 1.5
   *    - Some keywords match: score × 1.0
   */
  searchEnhanced(query: string, limit: number = 20): SearchResult {
    if (!this.loaded) {
      throw new Error('Series cache not loaded. Call load() first.');
    }

    const MIN_RESULTS_THRESHOLD = 3;

    // Extract keywords from query
    const keywords = this.extractKeywords(query);

    // If no valid keywords after filtering, return empty
    if (keywords.length === 0) {
      return {
        series: [],
        metadata: {
          query,
          keywords: [],
          totalMatches: 0,
          searchStrategy: 'full_match',
        },
      };
    }

    // Step 1: Try full query first
    const fullQuery = keywords.join(' ');
    const fullMatchResults = this.searchSingleQuery(fullQuery);

    // If we have enough results with full query, return those (with bonus score)
    if (fullMatchResults.length >= MIN_RESULTS_THRESHOLD) {
      const boostedResults = fullMatchResults.map((item) => ({
        ...item,
        score: item.score * 2.0, // Full match bonus
        matchType: 'full' as const,
        matchedKeywords: keywords,
      }));

      return {
        series: boostedResults
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((item) => item.series),
        metadata: {
          query,
          keywords,
          totalMatches: boostedResults.length,
          searchStrategy: 'full_match',
        },
      };
    }

    // Step 2: Fallback to individual keyword search
    const keywordResults = new Map<string, ScoredSeries>();

    for (const keyword of keywords) {
      const results = this.searchSingleQuery(keyword);

      for (const result of results) {
        const ticker = result.series.ticker;
        const existing = keywordResults.get(ticker);

        if (existing) {
          // Combine scores and track matched keywords
          existing.score += result.score;
          existing.matchedKeywords = [
            ...(existing.matchedKeywords || []),
            keyword,
          ];
        } else {
          keywordResults.set(ticker, {
            ...result,
            matchedKeywords: [keyword],
            matchType: 'keyword',
          });
        }
      }
    }

    // Step 3: Apply multipliers based on keyword coverage
    const scoredResults = Array.from(keywordResults.values()).map((item) => {
      const matchedCount = item.matchedKeywords?.length || 0;
      const totalKeywords = keywords.length;

      // All keywords matched: 1.5x multiplier
      // Some keywords matched: 1.0x multiplier
      const multiplier = matchedCount === totalKeywords ? 1.5 : 1.0;

      return {
        ...item,
        score: item.score * multiplier,
        matchType: matchedCount === totalKeywords ? ('partial' as const) : ('keyword' as const),
      };
    });

    return {
      series: scoredResults
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => item.series),
      metadata: {
        query,
        keywords,
        totalMatches: scoredResults.length,
        searchStrategy: 'keyword_fallback',
      },
    };
  }

  /**
   * Search series by single query string (internal helper)
   * Returns series ranked by relevance
   */
  private searchSingleQuery(query: string): ScoredSeries[] {
    const lowerQuery = query.toLowerCase();
    const scored: ScoredSeries[] = [];

    for (const series of this.series.values()) {
      const score = this.scoreSeriesForKeyword(series, lowerQuery);

      if (score > 0) {
        scored.push({ series, score });
      }
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Search series by keyword with weighted ranking (legacy method)
   * Returns series ranked by relevance
   *
   * Scoring:
   * - Exact tag match: +100
   * - Partial tag match: +50
   * - Title contains query: +30
   * - Title starts with query: +20 (bonus)
   * - Category match: +10
   *
   * @deprecated Use searchEnhanced() for better results with multi-keyword fallback
   */
  search(query: string, limit: number = 20): Series[] {
    return this.searchEnhanced(query, limit).series;
  }

  /**
   * Get series by ticker
   */
  get(ticker: string): Series | undefined {
    if (!this.loaded) {
      throw new Error('Series cache not loaded. Call load() first.');
    }
    return this.series.get(ticker);
  }

  /**
   * Get all series
   */
  getAll(): Series[] {
    if (!this.loaded) {
      throw new Error('Series cache not loaded. Call load() first.');
    }
    return Array.from(this.series.values());
  }

  /**
   * Reload series from API
   * Use this to refresh cache without restarting server
   */
  async reload(): Promise<void> {
    logger.info('🔄 Reloading series cache...');
    await this.load();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      loaded: this.loaded,
      loadedAt: this.loadedAt,
      count: this.series.size,
      sizeMB: (
        JSON.stringify(Array.from(this.series.values())).length /
        1024 /
        1024
      ).toFixed(2),
    };
  }

  /**
   * Check if cache is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }
}

// Singleton instance
export const seriesCache = new SeriesCache();
