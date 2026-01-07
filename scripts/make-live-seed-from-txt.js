// scripts/make-seed-from-txt.js
// Usage:
//   node scripts/make-seed-from-txt.js live seed/live-2025.txt seed/live-2025.seed.json
//   node scripts/make-seed-from-txt.js other seed/other-2025.txt seed/other-2025.seed.json

const fs = require("fs");

function extractYoutubeId(input) {
  const s = (input || "").trim();

  // If it's already an 11-char id, accept it
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  // Try to parse URL
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
  } catch (e) {
    // not a URL
  }

  // Last resort: try to find an 11-char token that looks like an id
  const m = s.match(/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];

  return null;
}

function normalizeDate(d) {
  const s = (d || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function parseLine(line) {
  // supports: date | value   OR   date,value   OR   date  value
  const raw = line.trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return null;

  let date, value;

  if (raw.includes("|")) {
    [date, value] = raw.split("|").map((x) => x.trim());
  } else if (raw.includes(",")) {
    [date, value] = raw.split(",").map((x) => x.trim());
  } else {
    const parts = raw.split(/\s+/);
    date = parts.shift();
    value = parts.join(" ").trim();
  }

  const nd = normalizeDate(date);
  const id = extractYoutubeId(value);

  if (!nd || !id) return { error: true, raw };
  return { date: nd, youtubeId: id };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function makeTitle(category, date, index, total) {
  // Example: "Live 2025-01-02 — Live Video (2/3)"
  const label = category.toUpperCase();
  const suffix = total > 1 ? ` (${index}/${total})` : "";
  return `${label} ${date} — ${label} Video${suffix}`;
}

function main() {
  const [category, inputTxt, outputJson] = process.argv.slice(2);

  if (!category || !inputTxt || !outputJson) {
    console.log(
      "Usage: node scripts/make-seed-from-txt.js <live|other|qt> <input.txt> <output.json>"
    );
    process.exit(1);
  }

  const text = fs.readFileSync(inputTxt, "utf8");
  const lines = text.split(/\r?\n/);

  const parsed = [];
  const bad = [];

  for (const line of lines) {
    const r = parseLine(line);
    if (!r) continue;
    if (r.error) bad.push(r.raw);
    else parsed.push(r);
  }

  if (bad.length) {
    console.log("❌ These lines could not be parsed (fix them):");
    bad.forEach((b) => console.log("  -", b));
    process.exit(1);
  }

  // Group by date to assign (1/2), (2/2) style titles
  const byDate = new Map();
  for (const item of parsed) {
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  }

  // Sort dates and keep stable order in each date
  const dates = Array.from(byDate.keys()).sort();

  const out = [];
  for (const date of dates) {
    const arr = byDate.get(date);
    const total = arr.length;
    arr.forEach((v, i) => {
      const idx = i + 1;
      out.push({
        title: makeTitle(category, date, idx, total),
        youtubeId: v.youtubeId,
        category: category.toUpperCase(), // LIVE / OTHER / QT
        description: `${category.toUpperCase()} video for ${date}.`,
        topic: category.toUpperCase(),
        thumbnailUrl: "",
        duration: "",
        publishedAt: date,
      });
    });
  }

  fs.mkdirSync(require("path").dirname(outputJson), { recursive: true });
  fs.writeFileSync(outputJson, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ Wrote ${out.length} items to ${outputJson}`);
}

main();
