"use client";

import { useRef } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { outboxEntries } from "@/lib/offline-queue";

/**
 * Signs out and clears everything kept on the phone for offline use (saved pages and
 * unsynced logs), so the next person on this phone can't see or inherit them.
 * Warns first if there are logs that haven't synced yet.
 */
export function SignOutButton() {
  const form = useRef<HTMLFormElement>(null);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    const pending = (await outboxEntries()).length;
    if (pending && !confirm(`${pending} ${pending === 1 ? "log hasn't" : "logs haven't"} synced yet and will be lost if you sign out. Sign out anyway?`)) return;
    try {
      navigator.serviceWorker?.controller?.postMessage("clear-cache");
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      indexedDB.deleteDatabase("polestar-offline");
    } catch {}
    form.current?.requestSubmit();
  }

  return (
    <form ref={form} action={signOut}>
      <button onClick={onClick} className="btn-secondary w-full text-red-600"><LogOut size={16} /> Sign out</button>
    </form>
  );
}
