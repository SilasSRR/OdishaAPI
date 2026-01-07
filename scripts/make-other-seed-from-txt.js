// scripts/make-other-seed-from-txt.js
//
// TXT format per line (3 fields):
//   YYYY-MM-DD | Title | YouTubeURL-or-YouTubeID
//
// Example:
//   2020-04-14 | Creation | https://www.youtube.com/watch?v=OVAXiXEDJpc
//   2020-04-15 | Faith | OVAXiXEDJpc
//
// Output JSON items include your title + safe defaults.
// Category/topic are set to "OTHER" (change if your schema expects "other").
//
// Usage (Windows):
//   node scripts/make-other-seed-from-txt.js seed/other.txt seed/other.seed.json
//
// Usage (mac/linux):
//   node scripts/make-other-seed-from-txt.js seed/other.txt seed/other.seed.json

const fs = require("fs");
const path = require("path");

function extractYoutubeId(input) {
  const s = (input || "").trim();

  // If it's already an 11-char id, accept it
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  // Try URL parse
  try {
    const url = new URL(s);

    // watch?v=VIDEO_ID
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    // youtu.be/VIDEO_ID
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    // /shorts/VIDEO_ID or /embed/VIDEO_ID
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "shorts" || p === "embed");
    if (idx >= 0 && parts[idx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[idx + 1])) {
      return parts[idx + 1];
    }
  } catch (_) {
    // not a URL
  }

  // Last resort: find any 11-char token
  const m = s.match(/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function normalizeDate(d) {
  const s = (d || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseLine(line) {
  const raw = (line || "").trim();
  if (!raw || raw.startsWith("#")) return null;

  // Expect exactly 3 fields separated by "|"
  const parts = raw.split("|").map((p) => p.trim());
  if (parts.length < 3) return { error: true, raw, reason: "Expected 3 fields: date | title | url/id" };

  const date = normalizeDate(parts[0]);
  const title = parts[1];
  const youtubeId = extractYoutubeId(parts.slice(2).join(" | ")); // in case title contains "|"

  if (!date) return { error: true, raw, reason: "Invalid date (must be YYYY-MM-DD)" };
  if (!title) return { error: true, raw, reason: "Missing title" };
  if (!youtubeId) return { error: true, raw, reason: "Could not extract YouTube ID" };

  return { date, title, youtubeId };
}

function main() {
  const [inputTxt, outputJson] = process.argv.slice(2);

  if (!inputTxt || !outputJson) {
    console.log("Usage: node scripts/make-other-seed-from-txt.js <input.txt> <output.json>");
    process.exit(1);
  }

  const text = fs.readFileSync(inputTxt, "utf8");
  const lines = text.split(/\r?\n/);

  const items = [];
  const bad = [];

  for (const line of lines) {
    const r = parseLine(line);
    if (!r) continue;
    if (r.error) bad.push(r);
    else items.push(r);
  }

  if (bad.length) {
    console.log("❌ Fix these lines (cannot parse):");
    bad.forEach((b) => console.log(`  - ${b.raw}\n    ↳ ${b.reason}`));
    process.exit(1);
  }

  // IMPORTANT: set to whatever your mongoose enum expects:
  // If your schema enum is ["QT","LIVE","OTHER"], keep "OTHER".
  // If it's ["qt","live","other"], change to "other".
  const CATEGORY = "OTHER";

  const out = items.map((v) => ({
    title: v.title, // uses your provided title
    youtubeId: v.youtubeId,
    category: CATEGORY,
    description: `${CATEGORY} video for ${v.date}.`,
    topic: CATEGORY,
    thumbnailUrl: "",
    duration: "",
    publishedAt: v.date,
  }));

  fs.mkdirSync(path.dirname(outputJson), { recursive: true });
  fs.writeFileSync(outputJson, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ Wrote ${out.length} items to ${outputJson}`);
}

main();
