// WhatsApp message templates. Placeholders are filled in when the message is opened:
//   {contact}  contact person's first name (or "Sir/Ma'am")
//   {company}  client company
//   {my_name}  the salesperson's name
//   {rates}    lines for the lanes you pick, using SUGGESTED QUOTE prices (never buy rates)

export const PLACEHOLDERS = [
  { key: "{contact}", label: "Contact's name" },
  { key: "{company}", label: "Company" },
  { key: "{my_name}", label: "My name" },
  { key: "{rates}", label: "Live rates" },
] as const;

/** Given to each member the first time they open templates; they can edit or delete them. */
export const STARTER_TEMPLATES = [
  {
    name: "Weekly rates",
    body: "Hi {contact}, hope you're doing well!\n\nThis week's ocean freight rates:\n{rates}\n\nLet me know if you have any upcoming shipments and I'll block space for you.\n\n{my_name}",
  },
  {
    name: "Follow-up",
    body: "Hi {contact}, just following up on our last conversation. Do you have any shipments planned in the coming weeks? Happy to share a quote.\n\n{my_name}",
  },
  {
    name: "After a visit",
    body: "Hi {contact}, thank you for your time today. It was great meeting you at {company}. As discussed, I'll send across the details shortly. Please feel free to reach out anytime.\n\n{my_name}",
  },
  {
    name: "Checking in",
    body: "Hi {contact}, it's been a while! Just checking in to see how things are at {company}. Let me know if we can help with any shipments.\n\n{my_name}",
  },
];

export interface Template {
  id: string;
  name: string;
  body: string;
}

export interface QuoteLane {
  key: string;
  direction: "export" | "import";
  origin: string;
  destination: string;
  validUntil: string; // earliest validity across the lane's rates
  items: { label: string; quote: string }[];
}

export function firstName(person: string | null | undefined): string {
  const n = (person ?? "").trim().replace(/^(mr|mrs|ms|dr)\.?\s+/i, "");
  return n ? n.split(/\s+/)[0] : "Sir/Ma'am";
}

export function fillTemplate(
  body: string,
  vars: { contact: string | null; company: string; myName: string; rates: string },
): string {
  return body
    .replaceAll("{contact}", firstName(vars.contact))
    .replaceAll("{company}", vars.company)
    .replaceAll("{my_name}", vars.myName)
    .replaceAll("{rates}", vars.rates || "(rates on request)");
}

export function ratesText(lanes: QuoteLane[], fmtDate: (d: string) => string): string {
  return lanes
    .map((l) => `• ${l.origin} → ${l.destination}: ${l.items.map((i) => `${i.label} ${i.quote}`).join(", ")} (valid till ${fmtDate(l.validUntil)})`)
    .join("\n");
}
