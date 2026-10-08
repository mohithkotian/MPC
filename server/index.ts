import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PORT, ALLOWED_ORIGINS } from './config';
import { authRouter } from './routes/auth';
import { audioRouter } from './routes/audio';

const app = express();

// Trust exactly one known reverse-proxy hop in production. This makes req.secure
// reflect the original HTTPS request without trusting arbitrary client headers.
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/audio', audioRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Pulse MPC Secure Audio Delivery' });
});

const server = app.listen(PORT, () => {
  console.log(`[Pulse MPC Secure Audio Server] Listening on http://localhost:${PORT}`);
});

function shutdown(signal: string): void {
  console.log(`[Server] ${signal} received; draining connections`);
  server.close((error) => {
    if (error) {
      console.error('[Server] Graceful shutdown failed', error);
      process.exitCode = 1;
      return;
    }

    process.exitCode = 0;
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
