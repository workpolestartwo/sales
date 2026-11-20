// Generates sample-data/clients-addon.xlsx (+ .csv): an add-on upload for a list that
// already has 100 clients (phones 9000000001-9000000100). 138 rows:
//   130 new clients (phones 9000000101-9000000230)
//     3 existing clients, written differently, with newer business -> should UPDATE
//     5 repeats of new clients within this file                   -> should MERGE
// Expected after upload: ~230 clients. (A few new names could happen to match one of
// your existing 97 unknown names; the app would merge those, giving slightly fewer.)
// Run: node scripts/make-addon-data.mjs
import * as XLSX from "xlsx";
import * as fs from "node:fs";

XLSX.set_fs(fs);
const TODAY = new Date(Date.UTC(2026, 10, 20));

let seed = 2026;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const daysAgo = (n) => new Date(TODAY.getTime() - n * 86400000);
const fmt = (d) => d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "";

// Same duplicate rule as the app (src/lib/company-key.ts).
const key = (n) => {
  const lower = n.toLowerCase();
  const spaced = " " + lower.replace(/^\s*m\s*\/\s*s\.?\s*/, "").replace(/\./g, "").replace(/[^a-z0-9]+/g, " ") + " ";
  return spaced.replace(/\s(pvt|private|ltd|limited|llp|co|company|inc|corp|corporation|the|and)(?=\s)/g, " ").replace(/\s+/g, "") || lower.replace(/[^a-z0-9]+/g, "");
};

// Prefixes chosen to be unlikely in the existing list.
const prefixes = ["Aarav", "Vedant", "Ashoka", "Sahyadri", "Konkan", "Narmada", "Kaveri", "Indus", "Himalaya", "Dhanlaxmi", "Trimurti", "Suryodaya", "Chandrakant", "Vaibhav", "Pragati", "Nandini", "Shivam", "Annapurna", "Matrix", "Silverline", "Bluewave", "Harbour", "Anchor", "Meridian"];
const cores = { Exports: "Trading", Impex: "Trading", Pharma: "Pharma", Textiles: "Textiles", Polymers: "Chemicals", Chemicals: "Chemicals", Electricals: "Electrical", "Auto Parts": "Automotive", Garments: "Textiles", Spices: "Food", Engineering: "Engineering", Plastics: "Chemicals", Steel: "Metals", Packaging: "Packaging", Foods: "Food", Handicrafts: "Handicrafts", Machinery: "Engineering", Agro: "Agriculture" };
const suffixes = ["Pvt Ltd", "LLP", "& Co", "Industries", "Enterprises", "International", "", ""];
const first = ["Ramesh", "Sneha", "Amit", "Priya", "Rahul", "Kavita", "Suresh", "Neha", "Vikram", "Anjali", "Manoj", "Pooja", "Rajesh", "Deepa", "Arjun", "Meera", "Sanjay", "Ritu", "Nikhil", "Farah", "Imran", "Harpreet", "Joseph", "Lakshmi", "Tushar"];
const last = ["Patel", "Shah", "Mehta", "Iyer", "Desai", "Joshi", "Kulkarni", "Nair", "Reddy", "Singh", "Khan", "Fernandes", "Gupta", "Agarwal", "Pillai", "Sawant", "Chopra", "Bhatt"];
const areas = [...Array(14).fill("Andheri"), ...Array(8).fill("Powai"), ...Array(7).fill("Thane"), ...Array(6).fill("BKC"), ...Array(6).fill("Vashi"), ...Array(6).fill("Lower Parel"), ...Array(5).fill("Bhiwandi"), ...Array(4).fill("Malad"), ...Array(4).fill("Kurla"), ...Array(4).fill("Goregaon"), ...Array(3).fill("Nariman Point")];
const notes = ["Prefers morning calls", "Ships mostly to UAE", "Price sensitive", "Decision maker is the owner", "Seasonal: peaks before Diwali", "Asked for a rate card", "Uses two forwarders, we have ~40%", "", "", "", ""];

// The 3 clients known to exist (phones 1-3), so these must be treated as existing.
const existingKnown = ["Shakti Impex Enterprises", "Metro International & Co", "Rudra International & Co"];
const used = new Set(existingKnown.map(key));

const rows = [];
const fresh = [];
for (let i = 0; i < 130; i++) {
  let company, core;
  do {
    core = pick(Object.keys(cores));
    company = [pick(prefixes), core, pick(suffixes)].filter(Boolean).join(" ");
  } while (used.has(key(company)));
  used.add(key(company));

  const p = i / 130;
  let shipments, lastShip, lastMeet, lastContact, followUp = null;
  if (p < 0.10) { shipments = int(80, 300); lastShip = daysAgo(int(2, 30)); lastMeet = daysAgo(int(5, 40)); lastContact = daysAgo(int(1, 15)); }
  else if (p < 0.30) { shipments = int(20, 80); lastShip = daysAgo(int(15, 120)); lastMeet = daysAgo(int(20, 120)); lastContact = daysAgo(int(5, 40)); }
  else if (p < 0.60) { shipments = int(3, 20); lastShip = daysAgo(int(60, 400)); lastMeet = rand() < 0.7 ? daysAgo(int(60, 400)) : null; lastContact = rand() < 0.8 ? daysAgo(int(20, 200)) : null; }
  else if (p < 0.85) { shipments = int(1, 15); lastShip = daysAgo(int(365, 900)); lastMeet = rand() < 0.4 ? daysAgo(int(300, 900)) : null; lastContact = rand() < 0.5 ? daysAgo(int(200, 700)) : null; }
  else { shipments = 0; lastShip = null; lastMeet = rand() < 0.4 ? daysAgo(int(10, 90)) : null; lastContact = lastMeet ?? (rand() < 0.5 ? daysAgo(int(5, 60)) : null); }
  if (lastMeet && lastContact && lastContact < lastMeet) lastContact = lastMeet;
  if (i % 10 === 4) followUp = daysAgo(pick([2, 0, 0, -1, -3, -6]));

  const row = {
    "Company name": company,
    "Contact person": `${pick(first)} ${pick(last)}`,
    "Phone": `90000${String(101 + i).padStart(5, "0")}`,
    "Email": rand() < 0.5 ? `${company.split(" ")[0].toLowerCase()}${101 + i}@example.com` : "",
    "Area": pick(areas),
    "Address": `Unit ${int(1, 400)}, ${pick(["Industrial Estate", "Business Park", "Trade Centre", "Commercial Complex", "MIDC"])}`,
    "Industry": cores[core],
    "Total shipments": shipments,
    "First shipment date": shipments ? fmt(daysAgo(int(400, 3000))) : "",
    "Last shipment date": fmt(lastShip),
    "Last meeting date": fmt(lastMeet),
    "Last contact date": fmt(lastContact),
    "Next follow-up": fmt(followUp),
    "Notes": pick(notes),
  };
  fresh.push(row);
  rows.push(row);
}

// Existing clients, written differently, with newer business. Phone left blank on purpose:
// the upload must NOT erase the phone already saved.
[
  "M/S SHAKTI IMPEX ENTERPRISES",
  "Metro International and Company",
  "  rudra  international & co. ",
].forEach((company) => {
  rows.push({
    "Company name": company, "Contact person": "", "Phone": "", "Email": "", "Area": "", "Address": "", "Industry": "",
    "Total shipments": int(60, 120), "First shipment date": "", "Last shipment date": fmt(daysAgo(int(1, 6))),
    "Last meeting date": "", "Last contact date": fmt(daysAgo(int(1, 4))), "Next follow-up": "", "Notes": "Shipped again recently",
  });
});

// Repeats of new clients inside this file.
const variants = [(n) => n.toUpperCase(), (n) => `M/s ${n}`, (n) => n.toLowerCase(), (n) => n.replace("Pvt Ltd", "Pvt. Ltd."), (n) => ` ${n} `];
fresh.slice(5, 10).forEach((r, i) => rows.push({ ...r, "Company name": variants[i](r["Company name"]), Email: "", Notes: "" }));

rows.sort(() => rand() - 0.5);
fs.mkdirSync("sample-data", { recursive: true });
const ws = XLSX.utils.json_to_sheet(rows);
ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length + 2, 16) }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Clients");
XLSX.writeFile(wb, "sample-data/clients-addon.xlsx");
fs.writeFileSync("sample-data/clients-addon.csv", XLSX.utils.sheet_to_csv(ws));

const newKeys = new Set(fresh.map((r) => key(r["Company name"])));
console.log(`Wrote sample-data/clients-addon.xlsx: ${rows.length} rows = ${newKeys.size} new + 3 existing (renamed) + 5 repeats`);
console.log("Prospects:", fresh.filter((r) => r["Total shipments"] === 0).length, "· follow-ups:", fresh.filter((r) => r["Next follow-up"]).length);
