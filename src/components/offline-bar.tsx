"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { OUTBOX_EVENT, discardEntry, flushOutbox, outboxEntries } from "@/lib/offline-queue";

/**
 * Registers the service worker, shows when the phone is offline or has logs
 * waiting to sync, and sends them automatically when the connection returns.
 */
function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
}

export function OfflineBar() {
  const router = useRouter();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<{ id: string; error: string }[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    const refreshCount = async () => {
      const entries = await outboxEntries();
      setPending(entries.length);
      setFailed(entries.filter((e) => e.lastError).map((e) => ({ id: e.id, error: e.lastError! })));
    };
    const sync = async () => {
      if (!navigator.onLine) return;
      setSyncing(true);
      const sent = await flushOutbox();
      setSyncing(false);
      if (sent > 0) router.refresh();
    };
    const goOnline = () => { sync(); };

    refreshCount().then(sync);
    window.addEventListener("online", goOnline);
    window.addEventListener(OUTBOX_EVENT, refreshCount);
    const timer = setInterval(sync, 60_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener(OUTBOX_EVENT, refreshCount);
      clearInterval(timer);
    };
  }, [router]);

  if (online && pending === 0) return null;

  return (
    <div className={`sticky top-0 z-40 px-4 py-2 text-sm ${online ? "bg-sky-50 text-sky-900" : "bg-slate-800 text-white"}`}>
      <div className="flex items-center gap-2">
        {online ? <RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> : <CloudOff size={15} />}
        <span className="flex-1">
          {!online && "You're offline. You can still log visits, calls and texts."}
          {pending > 0 && ` ${pending} ${pending === 1 ? "log" : "logs"} saved on this phone${online ? (syncing ? ", syncing…" : ", waiting to sync") : ", will sync when you're back online"}.`}
        </span>
      </div>
      {failed.map((f) => (
        <div key={f.id} className="mt-1 flex items-center gap-2 text-xs text-red-700">
          <TriangleAlert size={13} />
          <span className="flex-1">A saved log couldn&apos;t be synced: {f.error}</span>
          <button className="underline" onClick={() => discardEntry(f.id)}>Discard</button>
        </div>
      ))}
    </div>
  );
}
