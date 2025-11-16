// Shared TypeScript types

export interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  yes_price: number; // 0-100 percentage
  no_price: number;
  volume?: number;
  open_interest?: number;
  status: 'open' | 'closed' | 'settled';
  close_time?: string;
  settlement_value?: boolean;
}

export interface MatchResult {
  market: KalshiMarket;
  confidence: number; // 0-1
  reasoning?: string;
}

export interface OCRResult {
  text: string;
  confidence: number;
  timestamp: number;
}

export interface ToastData {
  market: KalshiMarket;
  confidence: number;
  showDuration?: number; // milliseconds
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface ExtensionConfig {
  enabled: boolean;
  ocrInterval: number; // milliseconds between OCR scans
  minConfidence: number; // minimum match confidence to show toast
  cacheExpiry: number; // market cache expiry in milliseconds
}
