// オフライン・ショットバッファの IndexedDB ラッパ（Stage 1）。
//
// 圏外で測ったホール／ショットを端末に durable 保存し、オンライン復帰時に
// lib/offline/sync.ts の flush() が Supabase へ upsert する。本ファイルは
// 「保存・取得・削除」の最小APIのみを提供し、書き込み側（HoleRecorder）は
// Stage 2 で接続する。現段階ではバッファは常に空＝挙動への影響はゼロ。
//
// 主キーはクライアント生成UUIDをそのまま id に使う前提（rounds/holes/shots の
// 主キーは uuid_generate_v4 default なので、id 指定 insert/upsert が成立する）。

const DB_NAME = "gca_offline";
const DB_VERSION = 1;
const STORE_HOLES = "pending_holes";
const STORE_SHOTS = "pending_shots";

export interface PendingHole {
  id: string;
  round_id: string;
  hole_number: number;
  par: number;
  created_at: string;
}

export interface PendingShot {
  id: string;
  hole_id: string;
  round_id: string;
  shot_number: number;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  distance_meters: number | null;
  distance_yards: number | null;
  club_input_at: string | null;
  created_at: string;
}

// SSR / 非対応環境でも import だけで落ちないよう、利用時にガードする。
function isAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!isAvailable()) return Promise.resolve(null);
  return new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      console.warn("[offline-db] open failed", err);
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_HOLES)) {
        db.createObjectStore(STORE_HOLES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SHOTS)) {
        db.createObjectStore(STORE_SHOTS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn("[offline-db] open error", req.error);
      resolve(null);
    };
  });
}

// 1件 put（同一idは上書き）。
function put<T>(storeName: string, value: T): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) {
          resolve();
          return;
        }
        try {
          const tx = db.transaction(storeName, "readwrite");
          tx.objectStore(storeName).put(value as unknown as Record<string, unknown>);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            console.warn(`[offline-db] put error (${storeName})`, tx.error);
            db.close();
            resolve();
          };
        } catch (err) {
          console.warn(`[offline-db] put threw (${storeName})`, err);
          db.close();
          resolve();
        }
      }),
  );
}

// store 全件取得。
function getAll<T>(storeName: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise<T[]>((resolve) => {
        if (!db) {
          resolve([]);
          return;
        }
        try {
          const tx = db.transaction(storeName, "readonly");
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => {
            db.close();
            resolve((req.result ?? []) as T[]);
          };
          req.onerror = () => {
            console.warn(`[offline-db] getAll error (${storeName})`, req.error);
            db.close();
            resolve([]);
          };
        } catch (err) {
          console.warn(`[offline-db] getAll threw (${storeName})`, err);
          db.close();
          resolve([]);
        }
      }),
  );
}

// 1件 delete（flush 成功後に呼ぶ）。
function del(storeName: string, id: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) {
          resolve();
          return;
        }
        try {
          const tx = db.transaction(storeName, "readwrite");
          tx.objectStore(storeName).delete(id);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            console.warn(`[offline-db] delete error (${storeName})`, tx.error);
            db.close();
            resolve();
          };
        } catch (err) {
          console.warn(`[offline-db] delete threw (${storeName})`, err);
          db.close();
          resolve();
        }
      }),
  );
}

export function putHole(hole: PendingHole): Promise<void> {
  return put(STORE_HOLES, hole);
}

export function putShot(shot: PendingShot): Promise<void> {
  return put(STORE_SHOTS, shot);
}

export function getAllHoles(): Promise<PendingHole[]> {
  return getAll<PendingHole>(STORE_HOLES);
}

export function getAllShots(): Promise<PendingShot[]> {
  return getAll<PendingShot>(STORE_SHOTS);
}

export function deleteHole(id: string): Promise<void> {
  return del(STORE_HOLES, id);
}

export function deleteShot(id: string): Promise<void> {
  return del(STORE_SHOTS, id);
}
