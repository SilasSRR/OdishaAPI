/* scripts/syncYoutubeByYears.js */
require("dotenv").config();
const mongoose = require("mongoose");
const Video = require("../models/Video");

const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = process.env.YT_CHANNEL_ID;
const MONGODB_URI = process.env.MONGODB_URI;

if (!API_KEY || !CHANNEL_ID || !MONGODB_URI) {
  console.error("Missing env vars. Need YT_API_KEY, YT_CHANNEL_ID, MONGODB_URI");
  process.exit(1);
}

// ---------------- helpers ----------------
function parseArgs() {
  // usage: node scripts/syncYoutubeByYears.js --years=2020,2021,2026 --excludeShorts=true --maxPages=200
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
  // PT2M16S / PT1H3M2S etc.
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

// Videos tab only (exclude Live)
// search.list gives snippet.liveBroadcastContent: "none" | "live" | "upcoming"
function isNonLive(snippet) {
  return (snippet?.liveBroadcastContent || "none") === "none";
}

function qtDateFromPublishedAt(publishedAtISO) {
  return String(publishedAtISO).slice(0, 10); // YYYY-MM-DD
}

// --------------- YouTube calls ---------------

// Use Search API to fetch by date ranges (best for "only 2020/2021/2026")
async function searchVideoIdsByDateRange({ start, end, maxPages }) {
  const ids = [];
  let pageToken = "";
  let pages = 0;

  while (true) {
    pages += 1;
    if (maxPages && pages > maxPages) break;

    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&channelId=${encodeURIComponent(CHANNEL_ID)}` +
      `&type=video` +
      `&order=date` +
      `&maxResults=50` +
      `&publishedAfter=${encodeURIComponent(start.toISOString())}` +
      `&publishedBefore=${encodeURIComponent(end.toISOString())}` +
      `&key=${encodeURIComponent(API_KEY)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    const data = await ytFetchJson(url);

    for (const item of data.items || []) {
      // filter out Live/upcoming to match "Videos tab only"
      if (!isNonLive(item.snippet)) continue;

      const vid = item?.id?.videoId;
      if (vid) ids.push(vid);
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return ids;
}

async function fetchVideoDetails(videoIds) {
  // videos.list supports up to 50 ids
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails` +
    `&id=${encodeURIComponent(videoIds.join(","))}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await ytFetchJson(url);
  return data.items || [];
}

// --------------- main sync ---------------
async function syncYears({ years, excludeShorts, maxPages }) {
  let totalUpserted = 0;

  for (const y of years) {
    const { start, end } = yearRange(y);

    console.log(`\n=== Fetching year ${y} (Videos tab only) ===`);
    const ids = await searchVideoIdsByDateRange({ start, end, maxPages });

    console.log(`Found ${ids.length} candidate video ids for year ${y}`);

    // Process in chunks of 50
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const details = await fetchVideoDetails(chunk);

      for (const v of details) {
        // Extra safety: skip live (sometimes)
        if (!isNonLive(v.snippet)) continue;

        const durISO = v?.contentDetails?.duration || "";
        const duration = durISO ? iso8601ToHMS(durISO) : "";

        // Optional: exclude shorts (<60s)
        if (excludeShorts) {
          // quick check: if it has no hours and minutes=0 and seconds < 60, treat as short
          const m = durISO.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          const h = Number(m?.[1] || 0);
          const min = Number(m?.[2] || 0);
          const sec = Number(m?.[3] || 0);
          const totalSec = h * 3600 + min * 60 + sec;
          if (totalSec > 0 && totalSec < 60) continue;
        }

        const publishedAtISO = v?.snippet?.publishedAt || new Date().toISOString();

        const doc = {
          title: v?.snippet?.title || "",
          youtubeId: v?.id,
          category: "QT", // IMPORTANT: your /api/videos defaults to category QT
          qtDate: qtDateFromPublishedAt(publishedAtISO),
          description: v?.snippet?.description || "",
          topic: "QT",
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

        totalUpserted += 1;
      }
    }

    console.log(`Year ${y} done.`);
  }

  return totalUpserted;
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

  const upserted = await syncYears({ years, excludeShorts, maxPages });

  console.log(`\n✅ Sync finished. Upsert operations: ${upserted}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("Sync failed:", e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
