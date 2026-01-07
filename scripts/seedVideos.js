require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// IMPORTANT: match your model filename
const Video = require("../models/Video"); // or "../models/Video"

const SEED_FILES = [
  // "qt-2020.seed.json",
  // "qt-2021.seed.json",
  // "qt-2022.seed.json",
  // "qt-2023.seed.json",
  // "qt-2024.seed.json",
  // "qt-2025.seed.json",
  "live.seed.json",
  // "other.seed.json",
];

async function seedFile(filename) {
  const filePath = path.join(__dirname, "..", "seed", filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Skipping missing file: ${filename}`);
    return;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const items = JSON.parse(raw);

  if (!items.length) return;

  const category = items[0].category;

  // Delete existing videos for this category & year (QT only)
  if (category === "QT") {
    const year = filename.match(/\d{4}/)?.[0];
    if (year) {
      await Video.deleteMany({
        category: "QT",
        publishedAt: {
          $gte: new Date(`${year}-01-01T00:00:00.000Z`),
          $lte: new Date(`${year}-12-31T23:59:59.999Z`)
        }
      });
    }
  } else {
    // Replace whole category for Live / Other
    await Video.deleteMany({ category });
  }

  const docs = items.map(v => ({
    ...v,
    thumbnailUrl:
      v.thumbnailUrl && v.thumbnailUrl.trim()
        ? v.thumbnailUrl
        : `https://img.youtube.com/vi/${v.youtubeId}/hqdefault.jpg`
  }));

  await Video.insertMany(docs);
  console.log(`✅ Seeded ${docs.length} items from ${filename}`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");

  for (const file of SEED_FILES) {
    await seedFile(file);
  }

  await mongoose.disconnect();
  console.log("🎉 All seeding complete");
}

main().catch(err => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
