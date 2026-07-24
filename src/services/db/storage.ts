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

const DB_NAME = 'mcp_db';
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
  try {
    const db = await getDB();
    await db.put('projects', project);
  } catch (err) {
    console.error('Failed to save project to IndexedDB:', err);
  }
}

export async function loadProjectsFromDB(): Promise<ProjectData[]> {
  try {
    const db = await getDB();
    return await db.getAll('projects');
  } catch (err) {
    console.error('Failed to load projects from IndexedDB:', err);
    return [];
  }
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
  try {
    const db = await getDB();
    await db.put('samples', { id, name, type, data });
  } catch (err) {
    console.error('Failed to save sample blob to IndexedDB:', err);
  }
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
