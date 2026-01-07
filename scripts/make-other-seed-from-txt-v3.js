// scripts/make-other-seed-from-txt-v3.js
//
// INPUT TXT format (one line per video):
//   YYYY-MM-DD | Title | Duration | URL-or-YouTubeID
//
// Example:
//   2020-04-14 | Creation | 12:34 | https://www.youtube.com/watch?v=OVAXiXEDJpc
//
// OUTPUT JSON:
// - category/topic are set to "OTHER" (change if your enum expects "other")
// - description is auto-filled (generic) or empty
// - publishedAt comes from date
//
// Usage:
//   node scripts/make-other-seed-from-txt-v3.js seed/other.txt seed/other.seed.json

const fs = require("fs");
const path = require("path");

function extractYoutubeId(input) {
  const s = (input || "").trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  try {
    const url = new URL(s);

    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "shorts" || p === "embed");
    if (idx >= 0 && parts[idx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[idx + 1])) {
      return parts[idx + 1];
    }
  } catch (_) {}

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

  const parts = raw.split("|").map((p) => p.trim());

  // Expect 4 fields: date | title | duration | url
  if (parts.length < 4) {
    return { error: true, raw, reason: "Expected 4 fields: date | title | duration | url/id" };
  }

  const date = normalizeDate(parts[0]);
  const title = parts[1] || "";
  const duration = parts[2] || "";
  const urlOrId = parts.slice(3).join(" | ").trim();
  const youtubeId = extractYoutubeId(urlOrId);

  if (!date) return { error: true, raw, reason: "Invalid date (must be YYYY-MM-DD)" };
  if (!title) return { error: true, raw, reason: "Missing title" };
  if (!youtubeId) return { error: true, raw, reason: "Could not extract YouTube ID" };

  return { date, title, duration, youtubeId };
}

function main() {
  const [inputTxt, outputJson] = process.argv.slice(2);

  if (!inputTxt || !outputJson) {
    console.log("Usage: node scripts/make-other-seed-from-txt-v3.js <input.txt> <output.json>");
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
    console.log("❌ Fix these lines:");
    bad.forEach((b) => console.log(`  - ${b.raw}\n    ↳ ${b.reason}`));
    process.exit(1);
  }

  // IMPORTANT: match your mongoose enum EXACTLY
  const CATEGORY = "Other";

  // Group by date (supports multiple videos per day)
  const byDate = {};
  items.forEach((v) => {
    byDate[v.date] = byDate[v.date] || [];
    byDate[v.date].push(v);
  });

  const out = [];
  Object.keys(byDate)
    .sort()
    .forEach((date) => {
      const arr = byDate[date];
      const total = arr.length;

      arr.forEach((v, idx) => {
        const suffix = total > 1 ? ` (${idx + 1}/${total})` : "";
        out.push({
          title: v.title + suffix,
          youtubeId: v.youtubeId,
          category: CATEGORY,
          description: "", // removed / intentionally empty
          topic: CATEGORY,
          thumbnailUrl: "",
          duration: v.duration || "",
          publishedAt: date,
        });
      });
    });

  fs.mkdirSync(path.dirname(outputJson), { recursive: true });
  fs.writeFileSync(outputJson, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ Wrote ${out.length} items to ${outputJson}`);
}

main();
