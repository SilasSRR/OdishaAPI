// scripts/make-bread-of-life-seed-from-txt.js
//
// INPUT TXT (one line per video):
//   YYYY-MM-DD | The Bread Of Life DD Mon YYYY | MM:SS | https://www.youtube.com/watch?v=XXXXXXXXXXX
//
// Example:
//   2025-02-01 | The Bread Of Life 01 Feb 2025 | 02:35 | https://www.youtube.com/watch?v=DcgjcvBYgyY
//
// OUTPUT JSON (array of objects):
// [
//   {
//     "title": "The Bread Of Life 01 Feb 2025",
//     "youtubeId": "DcgjcvBYgyY",
//     "category": "QT",
//     "qtDate": "2025-02-01",
//     "description": "Daily QT for 2025-02-01.",
//     "topic": "QT",
//     "thumbnailUrl": "",
//     "duration": "02:35",
//     "publishedAt": "2025-02-01T00:01:00.000Z"
//   },
//   ...
// ]
//
// Notes:
// - Keeps multiple videos per qtDate (adds publishedAt seconds 00:01, 00:02, 00:03...)
// - Extracts YouTube ID from URL (supports watch?v=, youtu.be, shorts, embed, or raw 11-char id)
// - Title is taken from the TXT "Title" field (trimmed).
//
// Usage:
//   node scripts/make-bread-of-life-seed-from-txt.js seed/bread-of-life.txt seed/bread-of-life.seed.json
//

const fs = require("fs");
const path = require("path");

function extractYoutubeId(input) {
  const s = (input || "").trim();

  // raw id
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  // try URL parsing
  try {
    const url = new URL(s);

    // watch?v=
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    // youtu.be/<id>
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    // /shorts/<id> or /embed/<id>
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "shorts" || p === "embed");
    if (idx >= 0 && parts[idx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[idx + 1])) {
      return parts[idx + 1];
    }
  } catch (_) {
    // ignore
  }

  // last resort: find any 11-char token
  const m = s.match(/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function normalizeDate(d) {
  const s = (d || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizeDuration(d) {
  const s = (d || "").trim();
  // accept M:SS, MM:SS, H:MM:SS
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  return ""; // keep empty if unknown/invalid
}

function parseLine(line) {
  const raw = (line || "").trim();
  if (!raw || raw.startsWith("#")) return null;

  const parts = raw.split("|").map((p) => p.trim());
  if (parts.length < 4) {
    return { error: true, raw, reason: "Expected 4 fields: date | title | duration | url/id" };
  }

  const qtDate = normalizeDate(parts[0]);
  const title = parts[1] || "";
  const duration = normalizeDuration(parts[2] || "");
  const urlOrId = parts.slice(3).join(" | ").trim();
  const youtubeId = extractYoutubeId(urlOrId);

  if (!qtDate) return { error: true, raw, reason: "Invalid date (must be YYYY-MM-DD)" };
  if (!title) return { error: true, raw, reason: "Missing title" };
  if (!youtubeId) return { error: true, raw, reason: "Could not extract YouTube ID" };

  return { qtDate, title, duration, youtubeId };
}

function publishedAtFor(qtDate, indexWithinDay) {
  // indexWithinDay starts at 1 -> 00:01:00, 2 -> 00:02:00, ...
  const pad2 = (n) => String(n).padStart(2, "0");
  const mm = pad2(indexWithinDay);
  return `${qtDate}T00:${mm}:00.000Z`;
}

function main() {
  const [inputTxt, outputJson] = process.argv.slice(2);

  if (!inputTxt || !outputJson) {
    console.log(
      "Usage: node scripts/make-bread-of-life-seed-from-txt.js <input.txt> <output.json>"
    );
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

  const CATEGORY = "QT";

  // group by qtDate (supports multiple videos per day)
  const byDate = {};
  for (const v of items) {
    byDate[v.qtDate] = byDate[v.qtDate] || [];
    byDate[v.qtDate].push(v);
  }

  // ensure stable order: keep original order per day as it appears in file
  const out = [];
  Object.keys(byDate)
    .sort()
    .forEach((qtDate) => {
      const arr = byDate[qtDate];

      arr.forEach((v, idx) => {
        const order = idx + 1; // 1..N for publishedAt minutes
        out.push({
          title: v.title,
          youtubeId: v.youtubeId,
          category: CATEGORY,
          qtDate,
          description: `Daily QT for ${qtDate}.`,
          topic: CATEGORY,
          thumbnailUrl: "",
          duration: v.duration || "",
          publishedAt: publishedAtFor(qtDate, order),
        });
      });
    });

  fs.mkdirSync(path.dirname(outputJson), { recursive: true });
  fs.writeFileSync(outputJson, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ Wrote ${out.length} items to ${outputJson}`);
}

main();
