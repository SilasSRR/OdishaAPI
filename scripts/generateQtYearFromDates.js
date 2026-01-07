const fs = require("fs");
const path = require("path");

function extractYouTubeId(raw) {
  if (!raw) return "";
  let s = String(raw).trim().replace(/^["']|["']$/g, "").trim();

  // If someone accidentally pasted a full "date,id" into the RHS, keep only last chunk
  if (s.includes(",") && !s.includes("http")) {
    const parts = s.split(",");
    s = parts[parts.length - 1].trim();
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  let m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (m?.[1]) return m[1].slice(0, 11);

  m = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (m?.[1]) return m[1].slice(0, 11);

  m = s.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/);
  if (m?.[1]) return m[1].slice(0, 11);

  m = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (m?.[1]) return m[1].slice(0, 11);

  // fallback: find any 11-char token
  m = s.match(/([a-zA-Z0-9_-]{11})/);
  if (m?.[1]) return m[1];

  return "";
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const year = argv[0];
  const inArg = argv.find((a) => a.startsWith("--in="));
  const outArg = argv.find((a) => a.startsWith("--out="));

  if (!year || !/^\d{4}$/.test(year)) throw new Error("Year required, e.g. 2025");
  if (!inArg || !outArg) throw new Error("Need --in= and --out=");

  return {
    year: Number(year),
    inputPath: inArg.replace("--in=", ""),
    outputPath: outArg.replace("--out=", ""),
  };
}

function buildPublishedAtISO(qtDate, indexWithinDay) {
  const base = new Date(`${qtDate}T00:00:00.000Z`);
  base.setUTCMinutes(base.getUTCMinutes() + indexWithinDay);
  return base.toISOString();
}

function main() {
  const { year, inputPath, outputPath } = parseArgs();
  const absIn = path.resolve(inputPath);
  const absOut = path.resolve(outputPath);

  if (!fs.existsSync(absIn)) {
    console.error("❌ Input file not found:", absIn);
    process.exit(1);
  }

  const raw = fs.readFileSync(absIn, "utf-8");
  const lines = raw.split(/\r?\n/);

  let seen = 0;
  let skippedBad = 0;
  let skippedEmptyId = 0;
  let kept = 0;

  const perDateCount = {};
  const docs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    seen++;

    const idx = line.indexOf(",");
    if (idx === -1) {
      skippedBad++;
      continue;
    }

    const qtDate = line.slice(0, idx).trim();
    const rhs = line.slice(idx + 1).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(qtDate) || !qtDate.startsWith(`${year}-`)) {
      skippedBad++;
      continue;
    }

    const youtubeId = extractYouTubeId(rhs);
    if (!youtubeId) {
      skippedEmptyId++;
      continue;
    }

    const n = (perDateCount[qtDate] || 0) + 1;
    perDateCount[qtDate] = n;

    docs.push({
      title: `QT ${qtDate} — Daily Quiet Time`,
      youtubeId,
      category: "QT",
      qtDate,
      description: `Daily QT for ${qtDate}.`,
      topic: "QT",
      thumbnailUrl: "",
      duration: "",
      publishedAt: buildPublishedAtISO(qtDate, n),
    });

    kept++;
  }

  fs.writeFileSync(absOut, JSON.stringify(docs, null, 2), "utf-8");

  console.log("✅ Done");
  console.log("Input :", absIn);
  console.log("Output:", absOut);
  console.log({ seen, kept, skippedBad, skippedEmptyId });

  if (docs.length) {
    console.log("First record:", docs[0]);
  }
}

main();
