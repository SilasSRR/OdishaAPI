//syncLiveVideos.js

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
  if (!res.ok) throw new Error(`YouTube API error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function iso8601ToHMS(iso) {
  const m = String(iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = Number(m?.[1] || 0);
  const min = Number(m?.[2] || 0);
  const s = Number(m?.[3] || 0);
  const HH = String(h).padStart(2, "0");
  const MM = String(min).padStart(2, "0");
  const SS = String(s).padStart(2, "0");
  return h > 0 ? `${HH}:${MM}:${SS}` : `${MM}:${SS}`;
}

function pickThumb(snippet) {
  return (
    snippet?.thumbnails?.maxres?.url ||
    snippet?.thumbnails?.high?.url ||
    snippet?.thumbnails?.medium?.url ||
    snippet?.thumbnails?.default?.url ||
    ""
  );
}

function dateOnly(iso) {
  return String(iso || "").slice(0, 10);
}

async function searchLiveItemsByDateRange({ channelId, start, end }) {
  const items = [];
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
      if (vid) items.push(vid);
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return [...new Set(items)];
}

async function fetchVideoDetails(videoIds) {
  if (!videoIds.length) return [];
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails` +
    `&id=${encodeURIComponent(videoIds.join(","))}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await ytFetchJson(url);
  return data.items || [];
}

async function syncYear(year) {
  const { start, end } = yearRange(year);
  console.log(`Sync Live videos for ${year}`);

  const ids = await searchLiveItemsByDateRange({
    channelId: LIVE_CHANNEL_ID,
    start,
    end,
  });

  console.log(`Found ${ids.length} Live video ids for ${year}`);

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const videos = await fetchVideoDetails(chunk);

    for (const v of videos) {
      const publishedAt = v?.snippet?.publishedAt || new Date().toISOString();

      await Video.updateOne(
        { youtubeId: v.id },
        {
          $set: {
            title: v?.snippet?.title || "",
            youtubeId: v?.id,
            description: v?.snippet?.description || "",
            qtDate: dateOnly(publishedAt),
            thumbnailUrl: pickThumb(v?.snippet),
            duration: iso8601ToHMS(v?.contentDetails?.duration || ""),
            publishedAt: new Date(publishedAt),
            category: "Live",
            topic: "Live",
          },
        },
        { upsert: true }
      );
    }
  }
}

async function main() {
  const args = parseArgs();
  const years = args.years
    ? String(args.years).split(",").map((s) => s.trim()).filter(Boolean)
    : [String(new Date().getUTCFullYear())];

  await mongoose.connect(MONGODB_URI);
  console.log("Mongo connected.");

  for (const y of years) {
    await syncYear(y);
  }

  await mongoose.disconnect();
  console.log("Live sync complete");
}

main().catch(async (e) => {
  console.error("Live sync failed:", e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});