import mongoose from "mongoose";
import Video from "../models/Video.js";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = process.env.YT_CHANNEL_ID;
const MONGO_URI = process.env.MONGO_URI;

function isoToMMSS(iso) {
  const match = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
  const m = Number(match?.[1] || 0);
  const s = Number(match?.[2] || 0);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function getUploadsPlaylistId() {
  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function getLatestVideos(playlistId) {
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems` +
    `?part=snippet&maxResults=10&playlistId=${playlistId}&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  return data.items.map(i => i.snippet.resourceId.videoId);
}

async function getVideoDetails(ids) {
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails&id=${ids.join(",")}&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  return data.items;
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Mongo connected");

  const playlistId = await getUploadsPlaylistId();
  const ids = await getLatestVideos(playlistId);
  const videos = await getVideoDetails(ids);

  for (const v of videos) {
    const doc = {
      title: v.snippet.title,
      youtubeId: v.id,
      category: "QT",
      qtDate: v.snippet.publishedAt.slice(0, 10),
      description: v.snippet.description,
      topic: "QT",
      thumbnailUrl: v.snippet.thumbnails.high.url,
      duration: isoToMMSS(v.contentDetails.duration),
      publishedAt: v.snippet.publishedAt
    };

    await Video.updateOne(
      { youtubeId: doc.youtubeId },
      { $set: doc },
      { upsert: true }
    );
  }

  console.log("YouTube sync complete");
  process.exit(0);
}

run();
