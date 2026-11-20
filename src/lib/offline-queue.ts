"use client";

// Offline outbox for field logging. When there's no signal, a log is saved on the
// phone (IndexedDB) and sent automatically when the connection comes back.
// Every log carries a unique clientRef, so a retry can never save it twice.

import { logActivity, logFieldVisit } from "@/app/actions/activity";

type Kind = "activity" | "fieldVisit";
type Payload = Record<string, unknown>;
interface Entry { id: string; kind: Kind; payload: Payload; createdAt: number; lastError?: string }

const DB = "polestar-offline";
const STORE = "outbox";
export const OUTBOX_EVENT = "outbox-changed";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function outboxEntries(): Promise<Entry[]> {
  try { return ((await tx("readonly", (s) => s.getAll())) as Entry[]).sort((a, b) => a.createdAt - b.createdAt); }
  catch { return []; }
}

const notify = () => window.dispatchEvent(new Event(OUTBOX_EVENT));

/** Today's date on the phone, in India time. */
function phoneToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function send(kind: Kind, payload: Payload) {
  // The payload was built for these actions; the server validates everything again.
  return kind === "activity"
    ? logActivity(payload as unknown as Parameters<typeof logActivity>[0])
    : logFieldVisit(payload as unknown as Parameters<typeof logFieldVisit>[0]);
}

function isNetworkError(e: unknown) {
  return !navigator.onLine || e instanceof TypeError || /fetch|network|load failed/i.test(String((e as Error)?.message ?? e));
}

/**
 * Sends a log now if possible; if the phone is offline (or the request can't reach
 * the server), saves it to the outbox instead. Server-side validation errors are returned.
 */
export async function logOrQueue(kind: Kind, payload: Payload): Promise<{ ok?: boolean; queued?: boolean; error?: string; id?: string; added?: number }> {
  const full = { ...payload, activityDate: phoneToday(), clientRef: crypto.randomUUID() };
  if (navigator.onLine) {
    try {
      return await send(kind, full);
    } catch (e) {
      if (!isNetworkError(e)) return { error: "Something went wrong. Please try again." };
    }
  }
  await tx("readwrite", (s) => s.put({ id: full.clientRef, kind, payload: full, createdAt: Date.now() } satisfies Entry));
  notify();
  return { queued: true };
}

let flushing = false;

/** Sends everything waiting in the outbox, oldest first. Returns how many were sent. */
export async function flushOutbox(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const entry of await outboxEntries()) {
      try {
        const res = await send(entry.kind, entry.payload);
        if (res.error) {
          // The server rejected it (e.g. invalid data); keep it so the rep can see it.
          await tx("readwrite", (s) => s.put({ ...entry, lastError: res.error }));
        } else {
          await tx("readwrite", (s) => s.delete(entry.id));
          sent++;
        }
      } catch (e) {
        if (isNetworkError(e)) break; // still offline; try again later
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return sent;
}

export async function discardEntry(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  notify();
}
