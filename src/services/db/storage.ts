import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ProjectData } from '../../types';

interface MPCAppDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectData;
  };
  samples: {
    key: string;
    value: {
      id: string;
      name: string;
      type: string;
      data: ArrayBuffer;
    };
  };
}

const DB_NAME = 'mpc_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MPCAppDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MPCAppDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('samples')) {
          db.createObjectStore('samples', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveProjectToDB(project: ProjectData): Promise<void> {
  const db = await getDB();
  await db.put('projects', project);
}

export async function loadProjectsFromDB(): Promise<ProjectData[]> {
  const db = await getDB();
  return db.getAll('projects');
}

export async function deleteProjectFromDB(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('projects', id);
  } catch (err) {
    console.error('Failed to delete project from IndexedDB:', err);
  }
}

export async function saveSampleBlobToDB(id: string, name: string, type: string, data: ArrayBuffer): Promise<void> {
  const db = await getDB();
  await db.put('samples', { id, name, type, data });
}

export async function loadSampleBlobFromDB(id: string): Promise<{ id: string; name: string; type: string; data: ArrayBuffer } | undefined> {
  try {
    const db = await getDB();
    return await db.get('samples', id);
  } catch (err) {
    console.error('Failed to load sample blob from IndexedDB:', err);
    return undefined;
  }
}

export type LastSession = { kind: 'kit'; id: string } | { kind: 'project'; id: string };

const LAST_SESSION_KEY = 'mpc:last-session';

/** Persist the last opened kit/project so a refresh restores the same session. */
export function writeLastSession(session: LastSession): void {
  try {
    window.localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage may be unavailable (private mode); session restore is best-effort.
  }
}

export function readLastSession(): LastSession | null {
  try {
    const raw = window.localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastSession;
    if (parsed && (parsed.kind === 'kit' || parsed.kind === 'project') && typeof parsed.id === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
