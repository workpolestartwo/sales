// Generates sample-data/sample-master-list.xlsx (+ .csv): 250 fictional clients for testing.
// Run: node scripts/make-sample-data.mjs
// Names and numbers are made up. Phones use the 90000-00xxx range so WhatsApp/call buttons
// are clearly test numbers.
import * as XLSX from "xlsx";
import * as fs from "node:fs";
import { mkdirSync } from "node:fs";

XLSX.set_fs(fs);

const TODAY = new Date(Date.UTC(2026, 10, 19)); // matches project start; dates are relative to this

// Deterministic random so the file is the same every run.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const prefixes = ["Shree", "Om", "Sai", "Jai", "Laxmi", "Ganesh", "Mahalaxmi", "Navkar", "Siddhi", "Balaji", "Krishna", "Vardhman", "Shakti", "Arihant", "Patel", "Mehta", "Shah", "Desai", "Kapoor", "Iyer", "Global", "Bharat", "Sunrise", "Pioneer", "Apex", "Orion", "Zenith", "Coastal", "Metro", "Eastern"];
const cores = ["Exports", "Impex", "Pharma", "Textiles", "Polymers", "Chemicals", "Electricals", "Auto Parts", "Garments", "Spices", "Engineering", "Plastics", "Steel", "Packaging", "Foods", "Handicrafts", "Machinery", "Agro", "Overseas", "Traders"];
const suffixes = ["Pvt Ltd", "LLP", "& Co", "Industries", "Enterprises", "International", "", ""];
const industries = { Exports: "Trading", Impex: "Trading", Pharma: "Pharma", Textiles: "Textiles", Polymers: "Chemicals", Chemicals: "Chemicals", Electricals: "Electrical", "Auto Parts": "Automotive", Garments: "Textiles", Spices: "Food", Engineering: "Engineering", Plastics: "Chemicals", Steel: "Metals", Packaging: "Packaging", Foods: "Food", Handicrafts: "Handicrafts", Machinery: "Engineering", Agro: "Agriculture", Overseas: "Trading", Traders: "Trading" };
const first = ["Ramesh", "Sneha", "Amit", "Priya", "Rahul", "Kavita", "Suresh", "Neha", "Vikram", "Anjali", "Manoj", "Pooja", "Rajesh", "Deepa", "Arjun", "Meera", "Sanjay", "Ritu", "Nikhil", "Farah", "Imran", "Harpreet", "Joseph", "Lakshmi", "Tushar"];
const last = ["Patel", "Shah", "Mehta", "Iyer", "Desai", "Joshi", "Kulkarni", "Nair", "Reddy", "Singh", "Khan", "Fernandes", "Gupta", "Agarwal", "Pillai", "Sawant", "Chopra", "Bhatt"];
// Weighted so some areas cluster (good for testing field-visit grouping).
const areas = [
  ...Array(18).fill("Andheri"), ...Array(12).fill("BKC"), ...Array(10).fill("Lower Parel"), ...Array(10).fill("Powai"),
  ...Array(9).fill("Vashi"), ...Array(9).fill("Thane"), ...Array(8).fill("Bhiwandi"), ...Array(7).fill("Goregaon"),
  ...Array(6).fill("Kurla"), ...Array(6).fill("Nariman Point"), ...Array(5).fill("Malad"),
];
const notes = ["Prefers morning calls", "Ships mostly to UAE", "Price sensitive", "Decision maker is the owner", "Seasonal: peaks before Diwali", "Asked for a rate card", "Uses two forwarders, we have ~40%", "Expanding to Europe next year", "", "", "", ""];

const daysAgo = (n) => new Date(TODAY.getTime() - n * 86400000);
const fmt = (d, style) => {
  if (!d) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0"), yy = d.getUTCFullYear();
  if (style === 1) return `${yy}-${mm}-${dd}`; // ISO
  if (style === 2) return `${d.getUTCDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${yy}`;
  return `${dd}/${mm}/${yy}`; // most common in India
};

// Same duplicate rule as the app (src/lib/company-key.ts).
const key = (n) => {
  const lower = n.toLowerCase();
  const spaced = " " + lower.replace(/^\s*m\s*\/\s*s\.?\s*/, "").replace(/\./g, "").replace(/[^a-z0-9]+/g, " ") + " ";
  return spaced.replace(/\s(pvt|private|ltd|limited|llp|co|company|inc|corp|corporation|the|and)(?=\s)/g, " ").replace(/\s+/g, "") || lower.replace(/[^a-z0-9]+/g, "");
};
const used = new Set();
const rows = [];
const N = 250;
for (let i = 1; i <= N; i++) {
  const pct = i / N;
  let company;
  do company = [pick(prefixes), pick(cores), pick(suffixes)].filter(Boolean).join(" ");
  while (used.has(key(company)));
  used.add(key(company));
  const core = cores.find((c) => company.includes(c));

  // Segment the list so every tier and suggestion path gets exercised.
  let shipments, lastShip, lastMeet, lastContact, followUp = null;
  if (pct <= 0.12) { // big, active accounts
    shipments = int(80, 300); lastShip = daysAgo(int(3, 30)); lastMeet = daysAgo(int(5, 40)); lastContact = daysAgo(int(1, 15));
  } else if (pct <= 0.3) { // solid regulars
    shipments = int(20, 80); lastShip = daysAgo(int(15, 120)); lastMeet = daysAgo(int(20, 120)); lastContact = daysAgo(int(5, 40));
  } else if (pct <= 0.62) { // occasional
    shipments = int(3, 20); lastShip = daysAgo(int(60, 400)); lastMeet = daysAgo(int(60, 500)); lastContact = rand() < 0.8 ? daysAgo(int(20, 200)) : null;
  } else if (pct <= 0.88) { // gone quiet: old shipments, long since contact
    shipments = int(1, 15); lastShip = daysAgo(int(365, 900)); lastMeet = rand() < 0.5 ? daysAgo(int(300, 900)) : null; lastContact = rand() < 0.5 ? daysAgo(int(200, 700)) : null;
  } else { // prospects: never shipped
    shipments = 0; lastShip = null; lastMeet = rand() < 0.4 ? daysAgo(int(10, 90)) : null; lastContact = lastMeet ?? (rand() < 0.5 ? daysAgo(int(5, 60)) : null);
  }
  // A handful of explicit follow-ups: some due today, some overdue, some upcoming.
  if (i % 9 === 0) followUp = daysAgo(pick([0, 0, 2, 5, -2, -4]));

  const style = i % 10 === 0 ? 1 : i % 7 === 0 ? 2 : 0;
  const firstShip = shipments ? daysAgo(int(400, 3000)) : null;
  rows.push({
    "Party Name": company,
    "Contact Person": `${pick(first)} ${pick(last)}`,
    "Mobile No": `90000${String(i).padStart(5, "0")}`,
    "Email": rand() < 0.6 ? `${company.split(" ")[0].toLowerCase()}${i}@example.com` : "",
    "Location": pick(areas),
    "Address": `Unit ${int(1, 400)}, ${pick(["Industrial Estate", "Business Park", "Trade Centre", "Commercial Complex", "MIDC"])}`,
    "Industry": industries[core] ?? "Trading",
    "No of Shipments": shipments,
    "Client Since": fmt(firstShip, style),
    "Last Shipment Date": fmt(lastShip, style),
    "Last Visit": fmt(lastMeet, style),
    "Last Contact": fmt(lastContact, style),
    "Follow Up Date": fmt(followUp, style),
    "Remarks": pick(notes),
  });
}

mkdirSync("sample-data", { recursive: true });
const ws = XLSX.utils.json_to_sheet(rows);
ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length, 14) }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Clients");
XLSX.writeFile(wb, "sample-data/sample-master-list.xlsx");
fs.writeFileSync("sample-data/sample-master-list.csv", XLSX.utils.sheet_to_csv(ws));

const by = (f) => rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
console.log("Wrote sample-data/sample-master-list.xlsx with", rows.length, "clients");
console.log("Areas:", by((r) => r.Location));
console.log("Prospects (0 shipments):", rows.filter((r) => r["No of Shipments"] === 0).length, "· explicit follow-ups:", rows.filter((r) => r["Follow Up Date"]).length);

// ---------------------------------------------------------------------------
// Batch 2: sample-data/sample-master-list-batch2.xlsx (+ .csv)
// For testing "add more clients" after batch 1 is uploaded. 80 rows:
//   50 brand-new clients
//   20 clients already in batch 1, written differently (M/s, Pvt. Ltd., caps,
//      extra spaces) and some with newer shipment data -> should UPDATE, not duplicate
//   10 rows repeating new clients from this same file -> should MERGE into one
// Expected after uploading batch 1 then batch 2: 250 + 50 = 300 clients.
// ---------------------------------------------------------------------------
const taken = new Set(rows.map((r) => key(r["Party Name"])));
const prefixes2 = ["Trident", "Maruti", "Vishwas", "Kohinoor", "Rajdhani", "Ambika", "Parth", "Swastik", "Neelkanth", "Gokul", "Ratna", "Hindustan", "Prime", "Western", "Unity"];
const batch2 = [];
const fresh = [];
let phone = 251;
while (fresh.length < 50) {
  const company = [pick(prefixes2), pick(cores), pick(suffixes)].filter(Boolean).join(" ");
  if (taken.has(key(company))) continue;
  taken.add(key(company));
  const shipments = rand() < 0.15 ? 0 : int(1, 60);
  const row = {
    "Party Name": company,
    "Contact Person": `${pick(first)} ${pick(last)}`,
    "Mobile No": `90000${String(phone++).padStart(5, "0")}`,
    "Email": rand() < 0.5 ? `${company.split(" ")[0].toLowerCase()}${phone}@example.com` : "",
    "Location": pick(areas),
    "Address": `Unit ${int(1, 400)}, ${pick(["Industrial Estate", "Business Park", "Trade Centre", "Commercial Complex", "MIDC"])}`,
    "Industry": industries[cores.find((c) => company.includes(c))] ?? "Trading",
    "No of Shipments": shipments,
    "Client Since": shipments ? fmt(daysAgo(int(200, 2000)), 0) : "",
    "Last Shipment Date": shipments ? fmt(daysAgo(int(5, 300)), 0) : "",
    "Last Visit": rand() < 0.5 ? fmt(daysAgo(int(10, 200)), 0) : "",
    "Last Contact": rand() < 0.7 ? fmt(daysAgo(int(3, 120)), 0) : "",
    "Follow Up Date": "",
    "Remarks": pick(notes),
  };
  fresh.push(row);
  batch2.push(row);
}

// Same clients as batch 1, written the way people actually type them.
const variants = [
  (n) => `M/s ${n}`,
  (n) => n.toUpperCase(),
  (n) => n.replace("Pvt Ltd", "Pvt. Ltd.").replace("LLP", "L.L.P."),
  (n) => n.replace("Pvt Ltd", "Private Limited"),
  (n) => `  ${n.replace(" ", "  ")} `,
  (n) => n.toLowerCase(),
];
const existingPicks = [...rows].sort(() => rand() - 0.5).slice(0, 20);
existingPicks.forEach((r, i) => {
  const newer = i % 2 === 0; // half carry newer business
  batch2.push({
    ...r,
    "Party Name": variants[i % variants.length](r["Party Name"]),
    "Mobile No": i % 3 === 0 ? "" : r["Mobile No"], // some rows missing phone: must not erase it
    "No of Shipments": newer ? r["No of Shipments"] + int(2, 10) : r["No of Shipments"],
    "Last Shipment Date": newer ? fmt(daysAgo(int(1, 10)), 0) : r["Last Shipment Date"],
    "Remarks": newer ? "Shipped again recently" : r["Remarks"],
  });
});

// Repeats of new clients within this file (e.g. two salespeople's sheets pasted together).
fresh.slice(0, 10).forEach((r, i) => {
  batch2.push({ ...r, "Party Name": variants[(i + 1) % variants.length](r["Party Name"]), "Email": "", "Remarks": "" });
});

batch2.sort(() => rand() - 0.5);
const ws2 = XLSX.utils.json_to_sheet(batch2);
ws2["!cols"] = Object.keys(batch2[0]).map((k) => ({ wch: Math.max(k.length, 14) }));
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, ws2, "Clients");
XLSX.writeFile(wb2, "sample-data/sample-master-list-batch2.xlsx");
fs.writeFileSync("sample-data/sample-master-list-batch2.csv", XLSX.utils.sheet_to_csv(ws2));
console.log(`Wrote sample-data/sample-master-list-batch2.xlsx with ${batch2.length} rows: 50 new, 20 already in batch 1 (written differently), 10 repeats within the file`);
