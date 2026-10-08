import 'dotenv/config';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';

function requiredProductionSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (isProduction && !value) {
    throw new Error(`FATAL: ${name} must be provided in production`);
  }
  return value ?? '';
}

const configuredPort = process.env.PORT ? Number(process.env.PORT) : 3000;
if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
  throw new Error('FATAL: PORT must be an integer between 1 and 65535');
}
export const PORT = configuredPort;

// Encryption key for at-rest AES-256-GCM (32 bytes)
export const SERVER_ENCRYPTION_KEY = requiredProductionSecret('SERVER_ENCRYPTION_KEY');

// JWT Secrets
export const JWT_SECRET = requiredProductionSecret('JWT_SECRET');
export const STREAM_TOKEN_EXPIRY = 60; // 60 seconds short-lived token expiry

// Storage Paths outside web root
export const STORAGE_DIR = path.join(process.cwd(), 'server', 'storage');
export const SAMPLES_DIR = path.join(STORAGE_DIR, 'samples');
export const MANIFEST_PATH = path.join(STORAGE_DIR, 'manifest.json');

// Allowed Origins for Anti-Hotlinking
const configuredOrigins = process.env.ALLOWED_ORIGINS
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && (!configuredOrigins || configuredOrigins.length === 0)) {
  throw new Error('FATAL: ALLOWED_ORIGINS must contain at least one origin in production');
}

export const ALLOWED_ORIGINS = configuredOrigins ?? [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];
