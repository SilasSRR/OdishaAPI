// scripts/fixLiveMisclassified.js
require("dotenv").config();
const mongoose = require("mongoose");
const Video = require("../models/Video");

const API_KEY = process.env.YT_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const LIVE_CHANNEL_ID = process.env.YT_LIVE_CHANNEL_ID;

if (!API_KEY || !MONGODB_URI || !LIVE_CHANNEL_ID) {
  console.error("Missing env vars: YT_API_KEY, MONGODB_URI/MONGO_URI, YT_LIVE_CHANNEL_ID");
  process.exit(1);
}

function parseArgs() {
  const args = {};
  for (const part of process.argv.slice(2)) {
    const [k, v] = part.replace(/^--/, "").split("=");
    args[k] = v ?? true;
  }
  return args;
}

function yearRange(year) {
  const y = Number(year);
  const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0));
  return { start, end };
}

async function ytFetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`YouTube API error ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function searchLiveIdsByDateRange({ channelId, start, end }) {
  const ids = [];
  let pageToken = "";

  while (true) {
    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&channelId=${encodeURIComponent(channelId)}` +
      `&type=video` +
      `&eventType=completed` +
      `&order=date` +
      `&maxResults=50` +
      `&publishedAfter=${encodeURIComponent(start.toISOString())}` +
      `&publishedBefore=${encodeURIComponent(end.toISOString())}` +
      `&key=${encodeURIComponent(API_KEY)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    const data = await ytFetchJson(url);

    for (const it of data.items || []) {
      const vid = it?.id?.videoId;
      if (vid) ids.push(vid);
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return ids;
}

async function main() {
  const args = parseArgs();
  const years = args.years
    ? String(args.years).split(",").map((s) => s.trim()).filter(Boolean)
    : [String(new Date().getUTCFullYear())];

  await mongoose.connect(MONGODB_URI);
  console.log("Mongo connected");

  // 1) Build the true set of Live youtubeIds from YouTube
  const realLiveIds = new Set();

  for (const y of years) {
    const { start, end } = yearRange(y);
    console.log(`Fetching true Live ids for ${y}...`);
    const ids = await searchLiveIdsByDateRange({
      channelId: LIVE_CHANNEL_ID,
      start,
      end,
    });
    ids.forEach((id) => realLiveIds.add(id));
  }

  console.log(`True Live ids found: ${realLiveIds.size}`);

  // 2) Find all videos currently marked as Live in DB
  const dbLiveVideos = await Video.find({ category: "Live" }).select("_id youtubeId title");
  console.log(`DB videos currently marked Live: ${dbLiveVideos.length}`);

  let fixedCount = 0;

  for (const v of dbLiveVideos) {
    if (!realLiveIds.has(v.youtubeId)) {
      console.log(`Reclassifying ${v.youtubeId} -> QT | ${v.title}`);

      await Video.updateOne(
        { _id: v._id },
        {
          $set: {
            category: "QT",
            topic: "QT",
          },
        }
      );

      fixedCount += 1;
    }
  }

  console.log(`Cleanup complete. Reclassified ${fixedCount} videos from Live -> QT.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Cleanup failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});