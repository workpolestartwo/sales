// Generates the app icons in /public from an inline SVG. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const icon = (size, padded = false) => {
  const pad = padded ? size * 0.12 : 0; // maskable icons need a safe zone
  const s = size - pad * 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${padded ? 0 : size * 0.22}" fill="#1e3a8a"/>
  <g transform="translate(${pad} ${pad}) scale(${s / 100})">
    <path d="M30 76V24h22c11 0 18 7 18 16.5S63 57 52 57H41v19z" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>
    <circle cx="72" cy="74" r="7" fill="#f59e0b"/>
  </g>
</svg>`);
};

// Small monochrome badge for the Android status bar (white on transparent).
const badge = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 100 100">
  <path d="M30 80V20h22c12 0 20 8 20 18.5S64 58 52 58H41v22z" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/>
</svg>`);

await sharp(icon(192)).png().toFile("public/icon-192.png");
await sharp(icon(512)).png().toFile("public/icon-512.png");
await sharp(icon(512, true)).png().toFile("public/icon-maskable-512.png");
await sharp(icon(180)).flatten({ background: "#1e3a8a" }).png().toFile("public/apple-touch-icon.png");
await sharp(badge).png().toFile("public/badge-72.png");
console.log("Icons written to public/");
