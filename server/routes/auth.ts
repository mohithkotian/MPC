import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { JWT_SECRET } from '../config';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
});

authRouter.use(authLimiter);

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

/**
 * Require valid Short-Lived Access Token (Bearer) for authentication
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: string };
    req.user = decoded;
    next();
  } catch (error) {
    console.warn(`[Security] Invalid or expired access token attempt from IP: ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired access token' });
  }
}

/**
 * POST /api/auth/login
 * Sets HttpOnly refresh cookie and returns a short-lived access token
 */
authRouter.post('/login', (req: Request, res: Response) => {
  const { username } = req.body || {};
  const user = {
    id: `usr-${Date.now()}`,
    username: username || 'mpc-producer',
    role: 'user',
  };

  // Short-lived Access Token (10 minutes)
  const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '10m' });
  // Long-lived Refresh Token (7 days)
  const refreshToken = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

  res.cookie('pulse_refresh', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 3600 * 1000,
  });

  res.json({
    user,
    accessToken,
    message: 'Logged in successfully',
  });
});

/**
 * POST /api/auth/refresh
 * Exchanges a valid HttpOnly refresh cookie for a new short-lived access token
 */
authRouter.post('/refresh', (req: Request, res: Response) => {
  const refreshToken = req.cookies?.pulse_refresh;

  if (!refreshToken) {
    res.status(401).json({ error: 'Unauthorized: No refresh token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as { id: string; username: string; role: string };
    const user = { id: decoded.id, username: decoded.username, role: decoded.role };

    const newAccessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '10m' });

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired refresh token' });
  }
});

/**
 * GET /api/auth/session
 */
authRouter.get('/session', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});
