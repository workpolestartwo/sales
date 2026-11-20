"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reopenDay } from "@/app/actions/plan";

export function ReopenButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-ghost w-full"
      disabled={pending}
      onClick={() => start(async () => { await reopenDay(); router.refresh(); })}
    >
      {pending ? "Reopening…" : "Closed by mistake? Reopen today"}
    </button>
  );
}
