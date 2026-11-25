"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarCheck, MessagesSquare, Plus, Ship, Users, UsersRound } from "lucide-react";

const SALES = [
  { href: "/reports", label: "Reports", Icon: BarChart3 },
  { href: "/today", label: "Today", Icon: CalendarCheck },
  { href: "/log", label: "Log", Icon: Plus, primary: true },
  { href: "/clients", label: "Clients", Icon: Users },
  { href: "/rates", label: "Rates", Icon: Ship },
];

// Management (Director / VP): no sales screens.
const MANAGEMENT = [
  { href: "/admin/team", label: "Team", Icon: UsersRound },
  { href: "/admin/clients", label: "Clients", Icon: Users },
  { href: "/admin/messages", label: "Messages", Icon: MessagesSquare, badge: true },
  { href: "/rates", label: "Rates", Icon: Ship },
];

export function BottomNav({ management = false, unread = 0 }: { management?: boolean; unread?: number }) {
  const path = usePathname();
  const items = management ? MANAGEMENT : SALES;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className={`mx-auto grid max-w-xl ${management ? "grid-cols-4" : "grid-cols-5"}`}>
        {items.map((item) => {
          const { href, label, Icon } = item;
          const active = path.startsWith(href) || (href === "/admin/clients" && path.startsWith("/admin/client/")) || (href === "/admin/team" && path.startsWith("/admin/member/"));
          return (
            <li key={href}>
              <Link href={href} className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium">
                {"primary" in item && item.primary ? (
                  <span className="grid size-10 place-items-center rounded-full bg-brand text-brand-ink shadow-md">
                    <Icon size={22} />
                  </span>
                ) : (
                  <>
                    <span className="relative">
                      <Icon size={22} className={active ? "text-brand" : "text-muted"} />
                      {"badge" in item && item.badge && unread > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-bold text-white">{unread > 99 ? "99+" : unread}</span>
                      )}
                    </span>
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
