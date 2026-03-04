/* scripts/syncYoutubeByYears.js */
require("dotenv").config();
const mongoose = require("mongoose");
const Video = require("../models/Video");

const API_KEY = process.env.YT_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const QT_CHANNEL_ID = process.env.YT_QT_CHANNEL_ID;        // QT channel
const OTHER_CHANNEL_ID = process.env.YT_OTHER_CHANNEL_ID;  // Other channel

if (!API_KEY || !MONGODB_URI || !QT_CHANNEL_ID || !OTHER_CHANNEL_ID) {
  console.error(
    "Missing env vars. Need YT_API_KEY, MONGODB_URI (or MONGO_URI), YT_QT_CHANNEL_ID, YT_OTHER_CHANNEL_ID"
  );
  process.exit(1);
}

// ---------------- helpers ----------------
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

function iso8601ToHMS(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
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

function qtDateFromPublishedAt(publishedAtISO) {
  return String(publishedAtISO).slice(0, 10);
}

function isLiveLike(v) {
  if (v?.liveStreamingDetails) return true;
  const lbc = v?.snippet?.liveBroadcastContent;
  return lbc === "live" || lbc === "upcoming";
}

function isShortDurationISO(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = Number(m?.[1] || 0);
  const min = Number(m?.[2] || 0);
  const sec = Number(m?.[3] || 0);
  const totalSec = h * 3600 + min * 60 + sec;
  return totalSec > 0 && totalSec < 60;
}

// --------------- YouTube calls ---------------

async function searchVideoIdsByDateRange({ channelId, start, end, maxPages }) {
  const ids = [];
  let pageToken = "";
  let pages = 0;

  while (true) {
    pages += 1;
    if (maxPages && pages > maxPages) break;

    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&channelId=${encodeURIComponent(channelId)}` +
      `&type=video` +
      `&order=date` +
      `&maxResults=50` +
      `&publishedAfter=${encodeURIComponent(start.toISOString())}` +
      `&publishedBefore=${encodeURIComponent(end.toISOString())}` +
      `&key=${encodeURIComponent(API_KEY)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    const data = await ytFetchJson(url);

    for (const item of data.items || []) {
      const vid = item?.id?.videoId;
      if (vid) ids.push(vid);
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return Array.from(new Set(ids));
}

async function fetchVideoDetails(videoIds) {
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails,liveStreamingDetails` +
    `&id=${encodeURIComponent(videoIds.join(","))}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await ytFetchJson(url);
  return data.items || [];
}

// --------------- main sync ---------------

async function upsertForYear({ year, channelId, mode, excludeShorts, maxPages }) {
  const { start, end } = yearRange(year);

  console.log(`\n=== Fetching year ${year} for channel ${channelId} ===`);
  const ids = await searchVideoIdsByDateRange({ channelId, start, end, maxPages });
  console.log(`Found ${ids.length} candidate video ids for year ${year}`);

  let upserted = 0;

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const details = await fetchVideoDetails(chunk);

    for (const v of details) {
      const durISO = v?.contentDetails?.duration || "";
      if (excludeShorts && durISO && isShortDurationISO(durISO)) continue;

      const duration = durISO ? iso8601ToHMS(durISO) : "";
      const publishedAtISO = v?.snippet?.publishedAt || new Date().toISOString();
      const live = isLiveLike(v);

      let category = "QT";
      let topic = "QT";

      if (mode === "QT_LIVE_SPLIT") {
        category = live ? "Live" : "QT";
        topic = live ? "Live" : "QT";
      } else if (mode === "OTHER") {
        category = "Other";
        topic = "Other";
      }

      const doc = {
        title: v?.snippet?.title || "",
        youtubeId: v?.id,
        category,
        qtDate: qtDateFromPublishedAt(publishedAtISO),
        description: v?.snippet?.description || "",
        topic,
        thumbnailUrl: pickThumb(v?.snippet),
        duration,
        publishedAt: new Date(publishedAtISO),
      };

      if (!doc.youtubeId || !doc.title) continue;

      await Video.updateOne(
        { youtubeId: doc.youtubeId },
        { $set: doc },
        { upsert: true }
      );

      upserted += 1;
    }
  }

  console.log(`Year ${year} done. Upserted: ${upserted}`);
  return upserted;
}

async function main() {
  const args = parseArgs();
  const years = String(args.years || "2026")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const excludeShorts = String(args.excludeShorts || "false") === "true";
  const maxPages = args.maxPages ? Number(args.maxPages) : undefined;

  await mongoose.connect(MONGODB_URI);
  console.log("Mongo connected.");

  let total = 0;

  for (const y of years) {
    total += await upsertForYear({
      year: y,
      channelId: QT_CHANNEL_ID,
      mode: "QT_LIVE_SPLIT",
      excludeShorts,
      maxPages,
    });

    total += await upsertForYear({
      year: y,
      channelId: OTHER_CHANNEL_ID,
      mode: "OTHER",
      excludeShorts,
      maxPages,
    });
  }

  console.log(`\n✅ Sync finished. Total upserts: ${total}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("Sync failed:", e);
  try {
    await mongoose.disconnect();
  } catch (e) {
    console.error("Failed to disconnect from MongoDB:", e);
  }
  process.exit(1);
});
