import express from 'express';
import cors from 'cors';
import { PORT, ALLOWED_ORIGINS } from './config';
import { authRouter, meRouter } from './routes/auth';
import { audioRouter } from './routes/audio';

export const app = express();
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: false }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/audio', audioRouter);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Pulse MPC Secure Audio Delivery' }));

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => console.log(`[Pulse MPC Secure Audio Server] Listening on http://localhost:${PORT}`));
  function shutdown(signal: string): void {
    console.log(`[Server] ${signal} received; draining connections`);
    server.close((error) => { if (error) process.exitCode = 1; else process.exitCode = 0; });
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
