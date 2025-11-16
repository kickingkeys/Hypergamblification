import { type Context, type Next } from 'hono';
import { logger as pinoLogger } from '../../shared/logger.js';

/**
 * HTTP request logging middleware
 */
export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  const { method, path } = c.req;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  pinoLogger.info({
    method,
    path,
    status,
    duration,
  }, `${method} ${path} ${status} - ${duration}ms`);
}
