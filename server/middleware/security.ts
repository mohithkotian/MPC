import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { ALLOWED_ORIGINS } from '../config';

/**
 * Middleware enforcing no-store headers on all audio/key/token responses
 */
export function noCacheHeader(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
}

// In-memory blocklist for temporary bans
const blocklist = new Map<string, number>();

/**
 * Middleware enforcing anti-hotlinking by validating Origin / Referer
 */
export function antiHotlink(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin && !ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
    console.warn(`[SECURITY AUDIT] Blocked hotlinked request from Unauthorized Origin: ${origin}`);
    res.status(403).json({ error: 'Forbidden: Unauthorized Origin' });
    return;
  }

  if (referer) {
    const isRefererAllowed = ALLOWED_ORIGINS.some(allowed => referer.startsWith(allowed));
    if (!isRefererAllowed) {
      console.warn(`[SECURITY AUDIT] Blocked hotlinked request from Unauthorized Referer: ${referer}`);
      res.status(403).json({ error: 'Forbidden: Unauthorized Referer' });
      return;
    }
  }

  next();
}

/**
 * Checks if the IP is currently in the progressive blocklist
 */
export function checkBlocklist(req: Request, res: Response, next: NextFunction): void {
  const banExpiration = blocklist.get(req.ip!);
  if (banExpiration) {
    if (Date.now() > banExpiration) {
      blocklist.delete(req.ip!);
    } else {
      res.status(429).json({ error: 'Too many requests. You have been temporarily blocked.' });
      return;
    }
  }
  next();
}

/**
 * Rate Limiter for Audio Stream Endpoints
 * Prevents automated bulk scraping of sample files.
 * Max 150 requests per minute. If exceeded, triggers a 15-minute temporary ban.
 */
export const audioRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 150, 
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.warn(`[SECURITY AUDIT] Rate limit exceeded for IP: ${req.ip}. Triggering 15-minute ban.`);
    blocklist.set(req.ip!, Date.now() + 15 * 60 * 1000); // 15-minute ban
    res.status(429).json({ error: 'Too many sample stream requests. Temporary ban applied.' });
  }
});
