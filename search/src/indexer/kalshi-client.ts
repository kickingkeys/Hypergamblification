import { Configuration, MarketsApi, EventsApi, SeriesApi } from 'kalshi-typescript';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';

/**
 * Kalshi API client wrapper
 * Provides typed access to Kalshi markets, events, and series data
 */
export class KalshiClient {
  private marketsApi: MarketsApi;
  private eventsApi: EventsApi;
  private seriesApi: SeriesApi;

  constructor() {
    const kalshiConfig = new Configuration({
      apiKey: config.kalshi.apiKey,
      privateKeyPath: config.kalshi.privateKeyPath || undefined,
      privateKeyPem: config.kalshi.privateKey || undefined,
      basePath: config.kalshi.basePath,
    });

    this.marketsApi = new MarketsApi(kalshiConfig);
    this.eventsApi = new EventsApi(kalshiConfig);
    this.seriesApi = new SeriesApi(kalshiConfig);
  }

  /**
   * Fetch markets with pagination
   */
  async getMarkets(params: {
    limit?: number;
    cursor?: string;
    status?: string;
    seriesTicker?: string;
    eventTicker?: string;
  } = {}) {
    try {
      const response = await this.marketsApi.getMarkets(
        params.limit,
        params.cursor,
        params.eventTicker,
        params.seriesTicker,
        undefined, // maxCloseTs
        undefined, // minCloseTs
        params.status,
        undefined  // tickers
      );

      return {
        markets: response.data.markets || [],
        cursor: response.data.cursor,
      };
    } catch (error) {
      logger.error({ error, params }, 'Failed to fetch markets from Kalshi');
      throw error;
    }
  }

  /**
   * Fetch a single market by ticker
   */
  async getMarket(ticker: string) {
    try {
      const response = await this.marketsApi.getMarket(ticker);
      return response.data.market;
    } catch (error) {
      logger.error({ error, ticker }, 'Failed to fetch market from Kalshi');
      throw error;
    }
  }

  /**
   * Fetch events with pagination
   */
  async getEvents(params: {
    limit?: number;
    cursor?: string;
    seriesTicker?: string;
    status?: string;
  } = {}) {
    try {
      const response = await this.eventsApi.getEvents(
        params.limit,
        params.cursor,
        undefined, // withNestedMarkets
        params.status,
        params.seriesTicker,
        undefined  // minCloseTs
      );

      return {
        events: response.data.events || [],
        cursor: response.data.cursor,
      };
    } catch (error) {
      logger.error({ error, params }, 'Failed to fetch events from Kalshi');
      throw error;
    }
  }

  /**
   * Fetch a single event by ticker
   */
  async getEvent(eventTicker: string) {
    try {
      const response = await this.eventsApi.getEvent(eventTicker);
      return response.data.event;
    } catch (error) {
      logger.error({ error, eventTicker }, 'Failed to fetch event from Kalshi');
      throw error;
    }
  }

  /**
   * Fetch series
   * Note: Series API does not support pagination - returns all series
   */
  async getSeries(params: {
    limit?: number;
    cursor?: string;
  } = {}) {
    try {
      // Series API doesn't support pagination, so we ignore limit/cursor
      const response = await this.seriesApi.getSeries();

      return {
        series: response.data.series || [],
        cursor: undefined, // No pagination support
      };
    } catch (error) {
      logger.error({ error, params }, 'Failed to fetch series from Kalshi');
      throw error;
    }
  }
}
