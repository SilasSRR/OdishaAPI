require("dotenv").config();
const mongoose = require("mongoose");
const Video = require("../models/Video");
const SyncState = require("../models/SyncState");

const API_KEY = process.env.YT_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const LIVE_CHANNEL_ID = process.env.YT_LIVE_CHANNEL_ID;

if (!API_KEY || !MONGODB_URI || !LIVE_CHANNEL_ID) {
  console.error("Missing env vars");
  process.exit(1);
}

async function ytFetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`YouTube API error ${res.status}`);
  }

  return data;
}

function iso8601ToHMS(iso) {
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

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
  return String(iso).slice(0, 10);
}

async function fetchVideoDetails(ids) {

  if (!ids.length) return [];

  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails` +
    `&id=${ids.join(",")}` +
    `&key=${API_KEY}`;

  const data = await ytFetchJson(url);

  return data.items || [];
}

async function searchLiveVideos(afterDate) {

  const ids = [];
  let pageToken = "";

  while (true) {

    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&channelId=${LIVE_CHANNEL_ID}` +
      `&type=video` +
      `&eventType=completed` +
      `&order=date` +
      `&maxResults=50` +
      `&publishedAfter=${encodeURIComponent(afterDate.toISOString())}` +
      `&key=${API_KEY}` +
      (pageToken ? `&pageToken=${pageToken}` : "");

    const data = await ytFetchJson(url);

    for (const it of data.items || []) {

      const vid = it?.id?.videoId;

      if (vid) ids.push(vid);
    }

    pageToken = data.nextPageToken;

    if (!pageToken) break;
  }

  return [...new Set(ids)];
}

async function main() {

  await mongoose.connect(MONGODB_URI);

  console.log("Mongo connected");

  let state = await SyncState.findOne({ key: "live" });

  if (!state) {
    state = await SyncState.create({ key: "live", lastSyncedAt: null });
  }

  let after = state.lastSyncedAt;

  if (!after) {
    after = new Date();
    after.setDate(after.getDate() - 7);
  }

  else {
    after = new Date(after.getTime() - (24 * 60 * 60 * 1000));
  }

  console.log("Fetching Live videos after:", after.toISOString());

  const ids = await searchLiveVideos(after);

  console.log("Found", ids.length, "recent Live videos");

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

            topic: "Live"
          }
        },
        { upsert: true }
      );
    }
  }

  state.lastSyncedAt = new Date();

  await state.save();

  console.log("Live incremental sync complete");

  await mongoose.disconnect();
}

main().catch(err => {

  console.error(err);

  process.exit(1);

});