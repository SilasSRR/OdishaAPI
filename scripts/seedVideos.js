// scripts/seedVideos.js
require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// ✅ Odisha app: keep this as-is (your structure)
const Video = require("../models/Video");

const SEED_FILES = ["other.seed.json"];

function mustString(name, value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${name}: expected non-empty string`);
  }
  return value.trim();
}

function parsePublishedAt(value) {
  // Accept "YYYY-MM-DD" or ISO strings
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function buildThumb(youtubeId) {
  if (!youtubeId) return "";
  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
}

async function seedFile(filename) {
  const filePath = path.join(__dirname, "..", "seed", filename);

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Missing seed file, skipping: ${filePath}`);
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const items = JSON.parse(raw);

  if (!Array.isArray(items) || items.length === 0) {
    console.warn(`⚠️  No items in ${filename}`);
    return;
  }

  // Category is case-sensitive in your data ("Other")
  const category = items[0].category;

  if (!category) {
    throw new Error(`Seed file ${filename} missing items[0].category`);
  }

  // Replace the whole category (Other)
  const del = await Video.deleteMany({ category });
  console.log(`🧹 Deleted ${del.deletedCount} existing videos for category="${category}"`);

  // Prepare docs
  const docs = items.map((v, i) => {
    const youtubeId = mustString("youtubeId", v.youtubeId);
    const title = mustString("title", v.title);

    const publishedAt = parsePublishedAt(v.publishedAt);
    if (!publishedAt) {
      throw new Error(`Invalid publishedAt at index ${i}: "${v.publishedAt}"`);
    }

    return {
      title,
      youtubeId,
      category: v.category || category,
      topic: v.topic || v.category || category,
      description: typeof v.description === "string" ? v.description : "",
      duration: typeof v.duration === "string" ? v.duration : "",
      publishedAt,
      thumbnailUrl:
        typeof v.thumbnailUrl === "string" && v.thumbnailUrl.trim()
          ? v.thumbnailUrl.trim()
          : buildThumb(youtubeId),
    };
  });

  await Video.insertMany(docs, { ordered: false });
  console.log(`✅ Seeded ${docs.length} videos from ${filename}`);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is undefined. Set it in your .env file.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");

  for (const file of SEED_FILES) {
    await seedFile(file);
  }

  await mongoose.disconnect();
  console.log("🎉 All seeding complete");
}

main().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
