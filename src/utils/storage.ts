/** Tiny IndexedDB key-value store with localStorage fallback. */
const DB_NAME = 'titan-defense'
const STORE = 'kv'
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB()
  if (!db) {
    const raw = localStorage.getItem(`${DB_NAME}:${key}`)
    return raw ? (JSON.parse(raw) as T) : undefined
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).get(key)
      r.onsuccess = () => resolve(r.result as T | undefined)
      r.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  const plain = JSON.parse(JSON.stringify(value))
  if (!db) {
    localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(plain))
    return
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(plain, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function idbDel(key: string): Promise<void> {
  const db = await openDB()
  if (!db) {
    localStorage.removeItem(`${DB_NAME}:${key}`)
    return
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${DB_NAME}:${key}`)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}
export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value))
  } catch {
    /* quota */
  }
}
