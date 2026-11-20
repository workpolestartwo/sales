"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteTemplate, saveTemplate, type Template } from "@/app/actions/templates";
import { PLACEHOLDERS } from "@/lib/templates";
import { Sheet } from "./log-sheet";
import { Empty } from "./ui";

export function TemplateManager({ templates }: { templates: Template[] }) {
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted">
        Use these from the WhatsApp button on any client. <b>{"{rates}"}</b> lets you pick lanes and adds today&apos;s quote prices (never buy rates).
      </p>
      <button className="btn-primary w-full" onClick={() => setEditing({ name: "", body: "" })}><Plus size={16} /> New template</button>
      {templates.length === 0 ? (
        <Empty title="No templates yet">Create one for messages you send often.</Empty>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.id} className="card p-4">
              <div className="flex items-center gap-2">
                <p className="flex-1 font-semibold">{t.name}</p>
                <button className="grid size-9 place-items-center rounded-full text-muted" aria-label="Edit" onClick={() => setEditing(t)}><Pencil size={16} /></button>
              </div>
              <p className="mt-1 line-clamp-4 text-sm whitespace-pre-wrap text-muted">{t.body}</p>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateForm({ initial, onClose }: { initial: Partial<Template>; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  function insert(token: string) {
    const el = area.current;
    const at = el?.selectionStart ?? body.length;
    const next = body.slice(0, at) + token + body.slice(el?.selectionEnd ?? at);
    setBody(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  }

  const done = (res: { error?: string }) => {
    if (res.error) return setError(res.error);
    onClose();
    router.refresh();
  };

  return (
    <Sheet title={initial.id ? "Edit template" : "New template"} onClose={onClose}>
      <div className="space-y-4">
        <input className="input" placeholder="Name, e.g. Weekly rates" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <button key={p.key} type="button" className="chip min-h-8 px-2.5 text-xs" onClick={() => insert(p.key)}>+ {p.label}</button>
            ))}
          </div>
          <textarea ref={area} className="input py-2 text-sm" rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {contact}, …" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          {initial.id && (
            <button className="btn-ghost text-red-600" disabled={pending} aria-label="Delete template"
              onClick={() => confirm("Delete this template?") && start(async () => done(await deleteTemplate(initial.id!)))}>
              <Trash2 size={16} />
            </button>
          )}
          <button className="btn-primary flex-1" disabled={pending} onClick={() => start(async () => done(await saveTemplate({ id: initial.id, name, body })))}>
            {pending ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
