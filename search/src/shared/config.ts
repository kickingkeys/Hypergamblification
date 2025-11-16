import 'dotenv/config';

/**
 * Application configuration
 */
export const config = {
  // Kalshi API
  kalshi: {
    apiKey: process.env.KALSHI_API_KEY || '',
    privateKeyPath: process.env.KALSHI_PRIVATE_KEY_PATH || '',
    privateKey: process.env.KALSHI_PRIVATE_KEY || '',
    basePath: 'https://api.elections.kalshi.com/trade-api/v2',
  },

  // API Server
  api: {
    port: parseInt(process.env.PORT || '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },

  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
} as const;

/**
 * Validate required configuration
 */
export function validateConfig(): void {
  const required = {
    KALSHI_API_KEY: config.kalshi.apiKey,
  };

  // Must have either privateKeyPath or privateKey
  const hasPrivateKey = config.kalshi.privateKeyPath || config.kalshi.privateKey;

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  if (!hasPrivateKey) {
    throw new Error(
      'Missing required environment variable: KALSHI_PRIVATE_KEY or KALSHI_PRIVATE_KEY_PATH'
    );
  }
}
