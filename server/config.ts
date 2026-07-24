import 'dotenv/config';
import path from 'path';
import crypto from 'crypto';

export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Encryption key for at-rest AES-256-GCM (32 bytes)
export const SERVER_ENCRYPTION_KEY = process.env.SERVER_ENCRYPTION_KEY || crypto.createHash('sha256').update('pulse-mpc-master-audio-key-2026').digest();

// JWT Secrets
const secret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && !secret) {
  throw new Error('FATAL: JWT_SECRET must be provided in production');
}
export const JWT_SECRET = secret || 'pulse-mpc-jwt-stream-secret-key-3060s';
export const STREAM_TOKEN_EXPIRY = 60; // 60 seconds short-lived token expiry

// Storage Paths outside web root
export const STORAGE_DIR = path.join(process.cwd(), 'server', 'storage');
export const SAMPLES_DIR = path.join(STORAGE_DIR, 'samples');
export const MANIFEST_PATH = path.join(STORAGE_DIR, 'manifest.json');

// Allowed Origins for Anti-Hotlinking
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];
