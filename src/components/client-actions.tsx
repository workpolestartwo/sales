"use client";

import { useState } from "react";
import { CheckCircle2, MapPin, MessageCircle, Phone } from "lucide-react";
import { mapsLink } from "@/lib/areas";
import { LogSheet } from "./log-sheet";
import { WhatsAppSheet } from "./whatsapp-sheet";
import { telHref } from "./ui";

interface ClientLite { id: string; company: string; phone: string | null; contactPerson: string | null; address: string | null; area: string | null }

export function ClientActions({ client, today, myName }: { client: ClientLite; today: string; myName: string }) {
  const [open, setOpen] = useState<"log" | "wa" | null>(null);
  const noPhone = client.phone ? "" : "pointer-events-none opacity-40";
  return (
    <div className="grid grid-cols-4 gap-2">
      <a href={telHref(client.phone)} aria-disabled={!client.phone} className={`btn-secondary px-2 ${noPhone}`}>
        <Phone size={16} /> Call
      </a>
      <button onClick={() => setOpen("wa")} disabled={!client.phone} className="btn-secondary px-2">
        <MessageCircle size={16} /> Text
      </button>
      <a href={mapsLink([client.company, client.address, client.area])} target="_blank" rel="noreferrer" className="btn-secondary px-2">
        <MapPin size={16} /> Map
      </a>
      <button className="btn-primary px-2" onClick={() => setOpen("log")}><CheckCircle2 size={16} /> Log</button>
      {open === "log" && <LogSheet target={{ clientId: client.id, company: client.company, type: "call" }} today={today} onClose={() => setOpen(null)} />}
      {open === "wa" && (
        <WhatsAppSheet target={{ clientId: client.id, company: client.company, contactPerson: client.contactPerson, phone: client.phone }} myName={myName} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
