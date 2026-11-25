"use client";

import { useActionState } from "react";
import { saveProfile } from "@/app/actions/profile";
import type { Profile } from "@/lib/types";

export function ProfileForm({ profile, management = false }: { profile: Profile; management?: boolean }) {
  const [state, action, pending] = useActionState(saveProfile, undefined);
  return (
    <form action={action} className="card space-y-4 p-4">
      <div>
        <label className="label" htmlFor="full_name">Name</label>
        <input id="full_name" name="full_name" className="input" defaultValue={profile.full_name ?? ""} />
      </div>
      {!management && (<>
      <div>
        <p className="label">Daily targets</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["target_visits", "Meetings"],
            ["target_calls", "Calls"],
            ["target_texts", "Texts"],
          ] as const).map(([k, l]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-xs text-muted">{l}</span>
              <input name={k} type="number" min={0} inputMode="numeric" className="input text-center" defaultValue={profile[k]} />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">The Day Builder fills your plan up to these numbers.</p>
      </div>
      <div className="space-y-3">
        <p className="label">Focus list</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Keep my top</span>
          <input name="focus_count" type="number" min={5} max={500} inputMode="numeric" className="input w-20 text-center" defaultValue={profile.focus_count ?? 60} aria-label="Focus list size" />
          <span>clients in touch every</span>
          <input name="contact_every_days" type="number" min={1} max={90} inputMode="numeric" className="input w-16 text-center" defaultValue={profile.contact_every_days ?? 7} aria-label="Contact every N days" />
          <span>days</span>
        </div>
        <p className="text-xs text-muted">Your top clients by recent business become priority A and are suggested whenever they&apos;re due. Others only come up when you&apos;ve set a follow-up.</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Mark clients untouched after</span>
          <input name="stagnant_after_days" type="number" min={14} max={365} inputMode="numeric" className="input w-20 text-center" defaultValue={profile.stagnant_after_days ?? 60} aria-label="Untouched after N days" />
          <span>days</span>
        </div>
      </div>
      </>)}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && !pending && <p className="text-sm text-emerald-700">Saved.</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
