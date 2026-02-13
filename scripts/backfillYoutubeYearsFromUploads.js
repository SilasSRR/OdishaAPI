require("dotenv").config();
const mongoose = require("mongoose");
const Video = require("../models/Video");

const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = process.env.YT_CHANNEL_ID;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!API_KEY || !CHANNEL_ID || !MONGODB_URI) {
  console.error("Missing env vars. Need YT_API_KEY, YT_CHANNEL_ID, MONGODB_URI/MONGO_URI");
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

async function ytFetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`YT API error ${res.status}: ${JSON.stringify(data)}`);
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

function yearOf(iso) {
  return new Date(iso).getUTCFullYear();
}

async function getUploadsPlaylistId() {
  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=contentDetails&id=${encodeURIComponent(CHANNEL_ID)}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await ytFetchJson(url);
  const uploads = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("Uploads playlist not found.");
  return uploads;
}

async function listUploadPlaylistItems(playlistId, pageToken) {
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems` +
    `?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}` +
    `&key=${encodeURIComponent(API_KEY)}` +
    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

  return ytFetchJson(url);
}

async function fetchVideoDetails(ids) {
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails&id=${encodeURIComponent(ids.join(","))}` +
    `&key=${encodeURIComponent(API_KEY)}`;
  const data = await ytFetchJson(url);
  return data.items || [];
}

async function main() {
  const args = parseArgs();
  const years = String(args.years || "2020,2021")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean);

  const excludeShorts = String(args.excludeShorts || "false") === "true";

  await mongoose.connect(MONGODB_URI);
  console.log("Mongo connected.");

  const uploadsPlaylistId = await getUploadsPlaylistId();
  console.log("Uploads playlist:", uploadsPlaylistId);

  let pageToken = "";
  let scanned = 0;
  let matchedIds = [];

  // 1) Scan ALL uploads and collect only the years we want
  while (true) {
    const data = await listUploadPlaylistItems(uploadsPlaylistId, pageToken);

    for (const item of data.items || []) {
      scanned += 1;

      const publishedAt = item?.snippet?.publishedAt;
      const y = publishedAt ? yearOf(publishedAt) : null;

      if (y && years.includes(y)) {
        const vid = item?.snippet?.resourceId?.videoId;
        if (vid) matchedIds.push(vid);
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;

    if (scanned % 500 === 0) {
      console.log(`Scanned ${scanned} uploads... matched so far: ${matchedIds.length}`);
    }
  }

  console.log(`✅ Finished scan. Total uploads scanned: ${scanned}`);
  console.log(`✅ Video IDs matched for years [${years.join(", ")}]: ${matchedIds.length}`);

  // 2) Fetch details & upsert (chunks of 50)
  let upserts = 0;

  for (let i = 0; i < matchedIds.length; i += 50) {
    const chunk = matchedIds.slice(i, i + 50);
    const details = await fetchVideoDetails(chunk);

    for (const v of details) {
      const durISO = v?.contentDetails?.duration || "";
      const duration = durISO ? iso8601ToHMS(durISO) : "";

      // optional shorts filter
      if (excludeShorts) {
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
        category: "QT",
        qtDate: String(publishedAtISO).slice(0, 10),
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
      upserts += 1;
    }
  }

  console.log(`\n✅ Backfill complete. Upserts: ${upserts}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("Backfill failed:", e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
