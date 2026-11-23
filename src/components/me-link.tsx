"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { CircleUserRound } from "lucide-react";

const UserNameContext = createContext<string | null>(null);

export function UserNameProvider({ name, children }: { name: string | null; children: React.ReactNode }) {
  return <UserNameContext.Provider value={name?.trim() || null}>{children}</UserNameContext.Provider>;
}

/**
 * Signed-in member's full name and profile icon in the page header.
 * `compact` headers already hold action buttons, so phones show just the icon there.
 */
export function MeLink({ compact }: { compact?: boolean }) {
  const name = useContext(UserNameContext);
  return (
    <Link href="/settings" className="-mr-1 flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-full text-muted" aria-label={name ? `${name}: me and settings` : "Me and settings"}>
      {name && (
        <span className={`max-w-32 truncate text-sm font-semibold text-ink sm:inline sm:max-w-44 ${compact ? "hidden" : ""}`}>{name}</span>
      )}
      <CircleUserRound size={24} className="shrink-0" />
    </Link>
  );
}
