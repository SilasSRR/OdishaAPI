// scripts/cleanQtIds.js
// Usage:
//   node scripts/cleanQtIds.js seed/qt-2025.youtubeIds.txt seed/qt-2025.youtubeIds.cleaned.txt
//
// It reads lines in format: YYYY-MM-DD,<id_or_url_or_blank>
// and outputs:           YYYY-MM-DD,<youtubeId_or_blank>

const fs = require("fs");
const path = require("path");

function extractYouTubeId(raw) {
  if (!raw) return "";

  let s = String(raw).trim();

  // Remove surrounding quotes if any
  s = s.replace(/^["']|["']$/g, "").trim();

  // If user pasted full line accidentally, try to take right side after comma
  // (safety) — but we prefer caller to split by comma.
  if (s.includes(",") && !s.includes("http")) {
    const parts = s.split(",");
    s = parts[parts.length - 1].trim();
  }

  // If already looks like an ID (11 chars, allowed charset)
  // (YouTube IDs are typically 11 chars)
  const idLike = s.match(/^[a-zA-Z0-9_-]{11}$/);
  if (idLike) return s;

  // If it's a youtu.be short link
  // e.g. https://youtu.be/FGo8Djgzk2Y?t=10
  let m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (m && m[1]) {
    // take up to 11 if longer due to extra path noise
    return m[1].slice(0, 11);
  }

  // If it's a youtube.com/watch?v=ID
  // e.g. https://www.youtube.com/watch?v=rT7tjUIoVpM&list=...
  m = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (m && m[1]) return m[1].slice(0, 11);

  // If it's /shorts/ID
  m = s.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/);
  if (m && m[1]) return m[1].slice(0, 11);

  // If it's /embed/ID
  m = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (m && m[1]) return m[1].slice(0, 11);

  // Fallback: try to find any 11-char token that looks like an ID
  m = s.match(/([a-zA-Z0-9_-]{11})/);
  if (m && m[1]) return m[1];

  // Nothing usable
  return "";
}

function main() {
  const input = process.argv[2];
  const output = process.argv[3];

  if (!input || !output) {
    console.log(
      "Usage:\n  node scripts/cleanQtIds.js <input.txt> <output.txt>\n\nExample:\n  node scripts/cleanQtIds.js seed/qt-2025.youtubeIds.txt seed/qt-2025.youtubeIds.cleaned.txt"
    );
    process.exit(1);
  }

  const inPath = path.resolve(input);
  const outPath = path.resolve(output);

  const text = fs.readFileSync(inPath, "utf-8");
  const lines = text.split(/\r?\n/);

  const cleaned = [];
  let fixed = 0;
  let blank = 0;

  for (const line of lines) {
    const rawLine = line.trimEnd();

    // keep empty lines as-is (optional)
    if (!rawLine.trim()) {
      cleaned.push("");
      continue;
    }

    // Allow comments
    if (rawLine.trim().startsWith("#")) {
      cleaned.push(rawLine);
      continue;
    }

    // Expect: date,value  (value may be empty)
    const idx = rawLine.indexOf(",");
    if (idx === -1) {
      // No comma: keep line unchanged but report
      cleaned.push(rawLine);
      continue;
    }

    const date = rawLine.slice(0, idx).trim();
    const rhs = rawLine.slice(idx + 1).trim();

    const id = extractYouTubeId(rhs);

    if (!id) blank += 1;
    if (rhs && id && rhs !== id) fixed += 1;

    cleaned.push(`${date},${id}`);
  }

  fs.writeFileSync(outPath, cleaned.join("\n"), "utf-8");

  console.log("✅ Cleaned file written:");
  console.log("  Input :", inPath);
  console.log("  Output:", outPath);
  console.log(`  Lines converted (url → id): ${fixed}`);
  console.log(`  Lines with no id found:     ${blank}`);
}

main();
