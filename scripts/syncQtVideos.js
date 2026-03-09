//syncQtVideos.js

require("dotenv").config();
const mongoose = require("mongoose");
const Video = require("../models/Video");

const API_KEY = process.env.YT_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const QT_CHANNEL_ID = process.env.YT_QT_CHANNEL_ID;

if (!API_KEY || !MONGODB_URI || !QT_CHANNEL_ID) {
  console.error("Missing env vars: YT_API_KEY, MONGODB_URI/MONGO_URI, YT_QT_CHANNEL_ID");
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

async function getUploadsPlaylistId(channelId) {
  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=contentDetails&id=${encodeURIComponent(channelId)}` +
    `&key=${encodeURIComponent(API_KEY)}`;

  const data = await ytFetchJson(url);
  const uploads = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("Could not resolve uploads playlist for QT channel");
  return uploads;
}

async function getPlaylistVideoIdsByDateRange({ playlistId, start, end }) {
  const ids = [];
  let pageToken = "";

  while (true) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=snippet,contentDetails` +
      `&playlistId=${encodeURIComponent(playlistId)}` +
      `&maxResults=50` +
      `&key=${encodeURIComponent(API_KEY)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    const data = await ytFetchJson(url);

    for (const it of data.items || []) {
      const publishedAt = it?.contentDetails?.videoPublishedAt || it?.snippet?.publishedAt;
      if (!publishedAt) continue;

      const published = new Date(publishedAt);
      if (published >= start && published < end) {
        const vid = it?.contentDetails?.videoId;
        if (vid) ids.push(vid);
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return [...new Set(ids)];
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
  console.log(`Sync QT videos for ${year}`);

  const uploadsPlaylistId = await getUploadsPlaylistId(QT_CHANNEL_ID);
  const ids = await getPlaylistVideoIdsByDateRange({
    playlistId: uploadsPlaylistId,
    start,
    end,
  });

  console.log(`Found ${ids.length} QT video ids for ${year}`);

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
          },
          $setOnInsert: {
            category: "QT",
            topic: "QT",
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
  console.log("QT sync complete");
}

main().catch(async (e) => {
  console.error("QT sync failed:", e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});