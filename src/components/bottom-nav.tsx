"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarCheck, Plus, Ship, Users } from "lucide-react";

const ITEMS = [
  { href: "/reports", label: "Reports", Icon: BarChart3 },
  { href: "/today", label: "Today", Icon: CalendarCheck },
  { href: "/log", label: "Log", Icon: Plus, primary: true },
  { href: "/clients", label: "Clients", Icon: Users },
  { href: "/rates", label: "Rates", Icon: Ship },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {ITEMS.map(({ href, label, Icon, primary }) => {
          const active = path.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium">
                {primary ? (
                  <span className="grid size-10 place-items-center rounded-full bg-brand text-brand-ink shadow-md">
                    <Icon size={22} />
                  </span>
                ) : (
                  <>
                    <Icon size={22} className={active ? "text-brand" : "text-muted"} />
                    <span className={active ? "text-brand" : "text-muted"}>{label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
