import express from 'express';
import cors from 'cors';
import { PORT, ALLOWED_ORIGINS } from './config';
import { authRouter, meRouter } from './routes/auth';
import { audioRouter } from './routes/audio';
import { projectsRouter } from './routes/projects';

export const app = express();
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: false }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/audio', audioRouter);
app.use('/api/projects', projectsRouter);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Pulse MPC Secure Audio Delivery' }));

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) { next(error); return; }
  if (error instanceof SyntaxError && 'body' in (error as object)) {
    res.status(400).json({ error: 'Malformed JSON request' });
    return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error && (error as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large' });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => console.log(`[Pulse MPC Secure Audio Server] Listening on http://localhost:${PORT}`));
  function shutdown(signal: string): void {
    console.log(`[Server] ${signal} received; draining connections`);
    server.close((error) => { if (error) process.exitCode = 1; else process.exitCode = 0; });
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
