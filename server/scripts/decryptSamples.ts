import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { EncryptionService } from '../services/encryption';

import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.join(__dirname, '../storage/samples');
const MANIFEST_PATH = path.join(__dirname, '../storage/manifest.json');

async function decryptSamples() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('Manifest not found');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const newManifest: any = {};

  for (const [id, entry] of Object.entries(manifest) as [string, any][]) {
    const encPath = path.join(STORAGE_DIR, entry.encryptedFilename);
    if (!fs.existsSync(encPath)) {
      console.warn('Missing enc file:', encPath);
      continue;
    }

    const encryptedBuffer = fs.readFileSync(encPath);
    const iv = Buffer.from(entry.iv, 'base64');
    const authTag = Buffer.from(entry.authTag, 'base64');
    const decryptedBuffer = EncryptionService.decryptBuffer(encryptedBuffer, iv, authTag);
    
    const newFilename = entry.encryptedFilename.replace('.enc', '.mp3');
    const newPath = path.join(STORAGE_DIR, newFilename);
    
    fs.writeFileSync(newPath, decryptedBuffer);
    console.log(`Decrypted ${entry.originalName} to ${newFilename}`);

    // Update manifest to only point to the new filename
    newManifest[id] = {
      id: entry.id,
      kitId: entry.kitId,
      padIndex: entry.padIndex,
      originalName: entry.originalName,
      filename: newFilename
    };
    
    // Optionally delete the enc file
    fs.unlinkSync(encPath);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(newManifest, null, 2));
  console.log('Manifest updated successfully.');
}

decryptSamples().catch(console.error);
