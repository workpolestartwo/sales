// Approximate centre points of Mumbai-region localities, used to find "nearby" areas
// for field days (e.g. going to Andheri -> also Jogeshwari, Vile Parle, Sakinaka).
// No external map service is used. Add localities here as the team needs them.

const AREAS: Record<string, [number, number]> = {
  // Western suburbs
  "dahisar": [19.2502, 72.8597], "borivali": [19.2307, 72.8567], "kandivali": [19.2047, 72.8526],
  "malad": [19.1874, 72.8484], "goregaon": [19.1663, 72.8526], "jogeshwari": [19.1350, 72.8490],
  "andheri": [19.1197, 72.8468], "vile parle": [19.0990, 72.8440], "santacruz": [19.0810, 72.8410],
  "khar": [19.0700, 72.8370], "bandra": [19.0596, 72.8295], "mira road": [19.2813, 72.8687],
  "bhayandar": [19.3010, 72.8510], "vasai": [19.3919, 72.8397],
  // Central / eastern suburbs
  "bkc": [19.0660, 72.8680], "kalina": [19.0760, 72.8640], "kurla": [19.0726, 72.8845],
  "sakinaka": [19.1030, 72.8880], "marol": [19.1190, 72.8820], "chandivali": [19.1090, 72.8960],
  "powai": [19.1176, 72.9060], "vikhroli": [19.1110, 72.9280], "ghatkopar": [19.0860, 72.9080],
  "chembur": [19.0620, 72.9000], "govandi": [19.0550, 72.9150], "mankhurd": [19.0480, 72.9320],
  "sion": [19.0390, 72.8619], "wadala": [19.0160, 72.8650], "bhandup": [19.1440, 72.9370],
  "mulund": [19.1726, 72.9560], "kanjurmarg": [19.1290, 72.9330],
  // Island city
  "dadar": [19.0178, 72.8478], "matunga": [19.0270, 72.8550], "mahim": [19.0410, 72.8400],
  "worli": [19.0176, 72.8170], "prabhadevi": [19.0160, 72.8290], "lower parel": [18.9980, 72.8300],
  "parel": [19.0000, 72.8410], "byculla": [18.9790, 72.8330], "mazgaon": [18.9650, 72.8440],
  "masjid bunder": [18.9490, 72.8380], "fort": [18.9330, 72.8350], "ballard estate": [18.9450, 72.8410],
  "churchgate": [18.9322, 72.8264], "nariman point": [18.9256, 72.8242], "cuffe parade": [18.9150, 72.8200],
  "colaba": [18.9067, 72.8147], "grant road": [18.9630, 72.8150], "tardeo": [18.9690, 72.8140],
  // Thane / beyond
  "thane": [19.2183, 72.9781], "wagle estate": [19.1990, 72.9550], "kalwa": [19.1990, 72.9990],
  "bhiwandi": [19.2813, 73.0483], "kalyan": [19.2437, 73.1355], "dombivli": [19.2183, 73.0867],
  "ambernath": [19.2090, 73.1860], "ulhasnagar": [19.2215, 73.1645],
  // Navi Mumbai / port
  "airoli": [19.1590, 72.9990], "ghansoli": [19.1210, 73.0040], "mahape": [19.1130, 73.0270],
  "rabale": [19.1440, 73.0080], "vashi": [19.0771, 72.9986], "turbhe": [19.0750, 73.0170],
  "sanpada": [19.0640, 73.0090], "nerul": [19.0330, 73.0190], "belapur": [19.0230, 73.0390],
  "kharghar": [19.0470, 73.0700], "taloja": [19.0660, 73.1170], "panvel": [18.9894, 73.1175],
  "uran": [18.8780, 72.9390], "nhava sheva": [18.9500, 72.9500],
};

const ALIASES: Record<string, string> = {
  "bandra kurla complex": "bkc", "bandra kurla": "bkc", "jnpt": "nhava sheva", "jnpa": "nhava sheva",
  "nhava": "nhava sheva", "navi mumbai": "vashi", "cbd belapur": "belapur", "vileparle": "vile parle",
  "parle": "vile parle", "saki naka": "sakinaka", "kanjur marg": "kanjurmarg", "santa cruz": "santacruz",
  "mira bhayandar": "mira road", "ville parle": "vile parle", "andheri midc": "andheri", "marol midc": "marol",
  "thane west": "thane", "thane east": "thane", "ttc": "turbhe", "ttc midc": "turbhe",
};

/** "Andheri (E)", "andheri east", "Andheri West, Mumbai" -> "andheri". */
export function areaKey(area: string | null | undefined): string | null {
  if (!area) return null;
  let s = area.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  if (ALIASES[s]) return ALIASES[s]; // e.g. "navi mumbai" before "mumbai" is stripped
  s = s.replace(/\b(east|west|e|w|mumbai|bombay|maharashtra|india|station|road)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (ALIASES[s]) return ALIASES[s];
  if (AREAS[s]) return s;
  // "midc andheri", "andheri kurla road" -> first known locality mentioned
  for (const name of Object.keys(AREAS)) if (s.includes(name)) return name;
  for (const [alias, name] of Object.entries(ALIASES)) if (s.includes(alias)) return name;
  return s;
}

function km(a: [number, number], b: [number, number]): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight-line distance between two areas in km, or null if either is unknown. */
export function areaDistance(a: string | null | undefined, b: string | null | undefined): number | null {
  const ka = areaKey(a), kb = areaKey(b);
  if (!ka || !kb) return null;
  if (ka === kb) return 0;
  const pa = AREAS[ka], pb = AREAS[kb];
  return pa && pb ? km(pa, pb) : null;
}

export const NEARBY_KM = 7;

/** Is `area` the focus area or within NEARBY_KM of it? Returns the distance, or null if not nearby. */
export function nearbyDistance(focus: string | null | undefined, area: string | null | undefined): number | null {
  const d = areaDistance(focus, area);
  return d != null && d <= NEARBY_KM ? d : null;
}

/** Google Maps search link for a client (by name + address + area). */
export function mapsLink(parts: (string | null | undefined)[]): string {
  const q = parts.filter(Boolean).join(", ") + ", Mumbai";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
