import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PORT, ALLOWED_ORIGINS } from './config';
import { authRouter } from './routes/auth';
import { audioRouter } from './routes/audio';
import helmet from 'helmet';

const app = express();
app.set('trust proxy', 1);

app.use(helmet());

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
  res.json({ status: 'ok', service: 'MPC Secure Audio Delivery' });
});

app.listen(PORT, () => {
  console.log(`[MPC Secure Audio Server] Listening on http://localhost:${PORT}`);
});
