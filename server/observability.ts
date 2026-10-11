import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'X-Request-Id';
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_LOG_TEXT = 512;

type LogLevel = 'info' | 'warn' | 'error';
type LogValue = string | number | boolean | null;
export type LogContext = Record<string, LogValue | undefined>;

const counters = new Map<string, number>();

function safeRequestId(candidate: unknown): string {
  return typeof candidate === 'string' && ACCEPTED_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}

export function sanitizeLogText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/(password|token|secret|cookie|authorization|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, '[URL REDACTED]')
    .replace(/[A-Za-z]:\\[^\s]+/g, '[PATH REDACTED]')
    .slice(0, MAX_LOG_TEXT);
}

function sanitizeContext(context: LogContext): LogContext {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [
    key,
    typeof value === 'string' ? sanitizeLogText(value) : value,
  ]));
}

export function log(level: LogLevel, event: string, context: LogContext = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    severity: level,
    event,
    ...sanitizeContext(context),
  };
  console[level](JSON.stringify(payload));
}

export function incrementMetric(name: string, labels: Record<string, string> = {}): void {
  const labelText = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(',');
  const key = labelText ? `${name}{${labelText}}` : name;
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

export function getMetricSnapshot(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function resetMetricsForTests(): void {
  counters.clear();
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = safeRequestId(req.header(REQUEST_ID_HEADER));
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : (req.baseUrl || 'unmatched');
    const status = res.statusCode;
    incrementMetric('http_requests_total', { method: req.method, route: String(route), status_class: `${Math.floor(status / 100)}xx` });
    log(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'http.request.completed', {
      requestId: req.requestId,
      method: req.method,
      route: String(route),
      status,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });
  next();
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestId(req: Request): string {
  return req.requestId ?? 'unknown';
}

export { REQUEST_ID_HEADER };
