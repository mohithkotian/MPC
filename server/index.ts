import express from 'express';
import cors from 'cors';
import { PORT, ALLOWED_ORIGINS } from './config';
import { authRouter, meRouter } from './routes/auth';
import { audioRouter } from './routes/audio';
import { communityRouter } from './routes/community';
import { projectsRouter } from './routes/projects';
import { log, requestId, requestIdMiddleware, requestLoggingMiddleware } from './observability';

export const app = express();
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(requestIdMiddleware);
app.use(requestLoggingMiddleware);
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: false }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/audio', audioRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/community', communityRouter);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Pulse MPC Secure Audio Delivery' }));
app.get('/api/ready', (_req, res) => res.json({ status: 'ready', service: 'Pulse MPC Secure Audio Delivery' }));

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) { next(error); return; }
  if (error instanceof SyntaxError && 'body' in (error as object)) {
    res.status(400).json({ error: 'Malformed JSON request', requestId: requestId(req) });
    return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error && (error as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large', requestId: requestId(req) });
    return;
  }
  log('error', 'http.request.unhandled_error', { requestId: requestId(req), method: req.method, route: req.path, error: error instanceof Error ? error.message : 'unknown error' });
  res.status(500).json({ error: 'Internal server error', requestId: requestId(req) });
});

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => log('info', 'server.started', { port: PORT }));
  function shutdown(signal: string): void {
    log('info', 'server.shutdown_requested', { signal });
    server.close((error) => {
      if (error) {
        log('error', 'server.shutdown_failed', { signal, error: error.message });
        process.exitCode = 1;
      } else {
        log('info', 'server.stopped', { signal });
        process.exitCode = 0;
      }
    });
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
