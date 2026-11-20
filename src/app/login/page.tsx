"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <div className="mb-8">
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand text-lg font-bold text-brand-ink">P</div>
        <h1 className="text-2xl font-bold">Polestar Sales</h1>
        <p className="mt-1 text-sm text-muted">Sign in with the account your admin gave you.</p>
      </div>
      <form action={action} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button disabled={pending} className="btn-primary w-full">{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
