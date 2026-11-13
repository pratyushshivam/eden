/**
 * Keeps the world in the browser's own storage (IndexedDB), so a refresh or a
 * closed tab does not lose it. Nothing leaves the device. The land itself is
 * not stored: it grows again from the seed, exactly as before.
 */
import { createWorld, type World } from "../engine";

const DB = "eden";
const STORE = "worlds";
/** Raise this when the shape of a saved world changes; older saves are then ignored. */
const VERSION = 4;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function saveWorld(w: World): Promise<boolean> {
  try {
    const snap = { ...w, terrain: null, buckets: null, rng: w.rng.save(), version: VERSION };
    await tx("readwrite", (s) => s.put(snap, `world-${w.seed}`));
    await tx("readwrite", (s) => s.put(w.seed, "last"));
    return true;
  } catch {
    return false;
  }
}

/** The seed of the world last played here, if any. */
export async function lastSeed(): Promise<number | null> {
  try {
    const v = await tx<unknown>("readonly", (s) => s.get("last"));
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

/** A saved world for this seed, brought back to life, or null. */
export async function loadWorld(seed: number): Promise<World | null> {
  try {
    const snap = (await tx<unknown>("readonly", (s) => s.get(`world-${seed}`))) as (Omit<World, "rng"> & { rng: [number, number | null]; version: number }) | undefined;
    if (!snap || snap.version !== VERSION || snap.seed !== seed) return null;
    const w = createWorld(seed);
    const { terrain, rng, buckets } = w;
    Object.assign(w, snap, { terrain, rng, buckets });
    rng.restore(snap.rng);
    return w;
  } catch {
    return null;
  }
}

export async function forgetWorld(seed: number): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(`world-${seed}`));
  } catch {
    // Nothing to forget.
  }
}
