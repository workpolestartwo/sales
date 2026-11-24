import Link from "next/link";

export function AdminTabs({ active }: { active: "clients" | "team" }) {
  const tabs = [
    { key: "clients", href: "/admin", label: "Master list" },
    { key: "team", href: "/admin/team", label: "Team performance" },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`flex min-h-10 items-center justify-center rounded-lg text-sm font-semibold ${active === t.key ? "bg-surface shadow-sm" : "text-muted"}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
