"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveClient } from "@/app/actions/clients";
import type { Client } from "@/lib/types";

export function ClientForm({ client }: { client?: Client }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveClient, undefined);

  useEffect(() => {
    if (state?.ok && state.id) router.replace(`/clients/${state.id}`);
  }, [state, router]);

  const field = (name: keyof Client, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" defaultValue={(client?.[name] as string | number | null) ?? ""} {...props} />
    </div>
  );

  return (
    <form action={action} className="space-y-4 p-4">
      {client && <input type="hidden" name="id" value={client.id} />}
      {field("company", "Company name *", { required: true })}
      <div className="grid grid-cols-2 gap-3">
        {field("contact_person", "Contact person")}
        {field("phone", "Phone", { inputMode: "tel" })}
      </div>
      {field("email", "Email", { type: "email" })}
      <div className="grid grid-cols-2 gap-3">
        {field("area", "Area")}
        {field("industry", "Industry")}
      </div>
      {field("address", "Address")}
      <div className="grid grid-cols-2 gap-3">
        {field("total_shipments", "Total shipments", { type: "number", min: 0, inputMode: "numeric" })}
        {field("last_shipment_date", "Last shipment", { type: "date" })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field("next_follow_up", "Next follow-up", { type: "date" })}
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={client?.status ?? "prospect"}>
            <option value="prospect">Prospect</option>
            <option value="active">Active client</option>
            <option value="dormant">Dormant</option>
            <option value="lost">Lost</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} className="input py-2" defaultValue={client?.notes ?? ""} />
      </div>
      {state?.error && (
        <p className="text-sm text-red-600">
          {state.error}{" "}
          {state.id && state.id !== client?.id && <a href={`/clients/${state.id}`} className="font-semibold underline">Open it</a>}
        </p>
      )}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : client ? "Save changes" : "Add client"}</button>
    </form>
  );
}
