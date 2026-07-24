import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SAMPLES_DIR, MANIFEST_PATH, STORAGE_DIR, SERVER_ENCRYPTION_KEY } from '../config';
import { EncryptionService } from '../services/encryption';

interface SampleSource {
  kitId: string;
  padIndex: number;
  originalName: string;
  sourcePath: string;
}

async function prepareSamples() {
  console.log('[Prepare Samples] Encrypting raw audio files into secure server storage...');

  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  if (!fs.existsSync(SAMPLES_DIR)) {
    fs.mkdirSync(SAMPLES_DIR, { recursive: true });
  }

  const samplesToProcess: SampleSource[] = [
    // Kit 1 (FATHER)
    { kitId: 'kit1', padIndex: 0, originalName: 'vocal1.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'vocal1.mp3') },
    { kitId: 'kit1', padIndex: 1, originalName: 'vocal2.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'vocal2.mp3') },
    { kitId: 'kit1', padIndex: 2, originalName: 'vocal3.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'vocal3.mp3') },
    { kitId: 'kit1', padIndex: 3, originalName: 'vocal4.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'vocal4.mp3') },
    { kitId: 'kit1', padIndex: 4, originalName: 'faaaather.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'faaaather.mp3') },
    { kitId: 'kit1', padIndex: 5, originalName: 'bad-to-us.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'bad-to-us.mp3') },
    { kitId: 'kit1', padIndex: 6, originalName: 'see-this-coat.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'see-this-coat.mp3') },
    { kitId: 'kit1', padIndex: 7, originalName: 'lord-fast.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'lord-fast.mp3') },
    { kitId: 'kit1', padIndex: 8, originalName: 'beat-loop-2.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'beat-loop-2.mp3') },
    { kitId: 'kit1', padIndex: 9, originalName: 'intro.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'intro.mp3') },
    { kitId: 'kit1', padIndex: 10, originalName: 'guitar.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'guitar.mp3') },
    { kitId: 'kit1', padIndex: 11, originalName: 'lord-long.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'lord-long.mp3') },
    { kitId: 'kit1', padIndex: 12, originalName: 'turn-me-up.mp3', sourcePath: path.join(process.cwd(), 'public', 'father.mp3', 'turn-me-up.mp3') },

    // Kit 2 (RUNAWAY)
    { kitId: 'kit2', padIndex: 0, originalName: 'piano1.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'piano1.mp3') },
    { kitId: 'kit2', padIndex: 1, originalName: 'piano2.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'piano2.mp3') },
    { kitId: 'kit2', padIndex: 2, originalName: 'piano3.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'piano3.mp3') },
    { kitId: 'kit2', padIndex: 3, originalName: 'piano4.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'piano4.mp3') },
    { kitId: 'kit2', padIndex: 4, originalName: 'piano5.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'piano5.mp3') },
    { kitId: 'kit2', padIndex: 5, originalName: 'piano6.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'piano6.mp3') },
    { kitId: 'kit2', padIndex: 6, originalName: 'piano7.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'piano7.mp3') },
    { kitId: 'kit2', padIndex: 7, originalName: 'piano8.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'piano8.mp3') },
    { kitId: 'kit2', padIndex: 8, originalName: 'LookAtCha.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'LookAtCha.mp3') },
    { kitId: 'kit2', padIndex: 9, originalName: 'LadiesNGentlemen.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'LadiesNGentlemen.mp3') },
    { kitId: 'kit2', padIndex: 10, originalName: 'Hey.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'Hey.mp3') },
    { kitId: 'kit2', padIndex: 11, originalName: 'BeautifulStars.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'BeautifulStars.mp3') },
    { kitId: 'kit2', padIndex: 12, originalName: 'Instrumental-loop.mp3', sourcePath: path.join(process.cwd(), 'public', 'runnaway.mp3', 'Instrumental-loop.mp3') },
  ];

  const manifest: Record<string, any> = {};

  for (const sample of samplesToProcess) {
    if (!fs.existsSync(sample.sourcePath)) {
      console.warn(`[Prepare Samples] Skipping missing file: ${sample.sourcePath}`);
      continue;
    }

    const rawBuffer = fs.readFileSync(sample.sourcePath);
    const { iv, authTag, encryptedData } = EncryptionService.encryptBuffer(rawBuffer, SERVER_ENCRYPTION_KEY);

    const uuid = crypto.randomUUID();
    const encryptedFilename = `${uuid}.enc`;
    const targetPath = path.join(SAMPLES_DIR, encryptedFilename);

    fs.writeFileSync(targetPath, encryptedData);

    const sampleId = `${sample.kitId}-pad${sample.padIndex + 1}-${uuid.slice(0, 8)}`;
    manifest[sampleId] = {
      id: sampleId,
      kitId: sample.kitId,
      padIndex: sample.padIndex,
      originalName: sample.originalName,
      encryptedFilename,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };

    console.log(`[Prepare Samples] Encrypted ${sample.kitId} pad ${sample.padIndex + 1} (${sample.originalName}) -> ${encryptedFilename}`);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`[Prepare Samples] Done! Manifest written to ${MANIFEST_PATH} with ${Object.keys(manifest).length} encrypted samples.`);
}

prepareSamples().catch(err => {
  console.error('[Prepare Samples] Error:', err);
  process.exit(1);
});
