const express = require("express");
const mongoose = require("mongoose");
const Video = require("../models/Video"); // or "../models/Video" (match your filename)
const { requireAuth } = require("../middleware/auth");
const WatchProgress = require("../models/WatchProgress");
const CompletedVideo = require("../models/CompletedVideo");
const VideoComment = require("../models/VideoComment");
const User = require("../models/User");
const router = express.Router();


// helper: build snapshot
function snapshotFromVideo(v) {
  return {
    _id: v._id,
    title: v.title || "",
    youtubeId: v.youtubeId || "",
    description: v.description || "",
    topic: v.topic || "",
    thumbnailUrl: v.thumbnailUrl || "",
    duration: v.duration || "",
    category: v.category || "",
    publishedAt: v.publishedAt || null,
  };
}

// Cursor format: "<publishedAtISO>|<mongoId>"
// Example: "2025-12-14T05:30:00.000Z|657a1234abcd..."
function parseCursor(cursor) {
  if (!cursor) return null;
  const [publishedAtStr, idStr] = String(cursor).split("|");
  if (!publishedAtStr || !idStr) return null;

  const d = new Date(publishedAtStr);
  if (Number.isNaN(d.getTime())) return null;
  if (!mongoose.isValidObjectId(idStr)) return null;

  return { publishedAt: d, _id: new mongoose.Types.ObjectId(idStr) };
}

function makeCursor(doc) {
  return `${new Date(doc.publishedAt).toISOString()}|${doc._id.toString()}`;
}

// GET /api/videos?category=QT&sort=latest&limit=30&cursor=...
router.get("/", async (req, res) => {
  try {
    const category = (req.query.category || "QT").trim();
    const sort = (req.query.sort || "latest").trim().toLowerCase(); // latest | oldest
    const limit = Math.min(parseInt(req.query.limit || "30", 10), 100);
    const cursor = parseCursor(req.query.cursor);

    const isOldest = sort === "oldest";

    // Stable sort with tie-breaker by _id
    // latest:  publishedAt desc, _id desc
    // oldest:  publishedAt asc,  _id asc
    const sortObj = isOldest
      ? { publishedAt: 1, _id: 1 }
      : { publishedAt: -1, _id: -1 };

    const query = { category };

    // Apply cursor filter (the key part)
    if (cursor) {
      if (isOldest) {
        // Ascending: get items AFTER the cursor
        query.$or = [
          { publishedAt: { $gt: cursor.publishedAt } },
          { publishedAt: cursor.publishedAt, _id: { $gt: cursor._id } },
        ];
      } else {
        // Descending: get items AFTER the cursor (i.e., older than it)
        query.$or = [
          { publishedAt: { $lt: cursor.publishedAt } },
          { publishedAt: cursor.publishedAt, _id: { $lt: cursor._id } },
        ];
      }
    }

    // Fetch one extra to determine if there's a next page
    const docs = await Video.find(query)
      .sort(sortObj)
      .limit(limit + 1)
      .select("_id title youtubeId description topic thumbnailUrl duration category publishedAt");

    const hasMore = docs.length > limit;
    const videos = hasMore ? docs.slice(0, limit) : docs;

    const nextCursor = hasMore ? makeCursor(videos[videos.length - 1]) : null;

    res.json({ videos, nextCursor });
  } catch (e) {
    console.error("GET /api/videos error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/videos/:id (unchanged)
router.get("/:id", async (req, res) => {
  try {
    const v = await Video.findById(req.params.id).select(
      "_id title youtubeId description topic thumbnailUrl duration category publishedAt"
    );
    if (!v) return res.status(404).json({ message: "Video not found" });
    res.json({ video: v });
  } catch (e) {
    console.error("GET /api/videos/:id error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// -----------------------------
// ✅ Progress + Resume + Auto complete at 80%
// -----------------------------
router.get("/:id/progress", requireAuth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).select("_id youtubeId duration");
    if (!video) return res.status(404).json({ message: "Video not found" });

    const doc = await WatchProgress.findOne({ userId: req.userId, videoId: video._id }).lean();
    res.json({
      progress: doc || null,
    });
  } catch (e) {
    console.error("GET /api/videos/:id/progress error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/progress", requireAuth, async (req, res) => {
  try {
    const { positionSeconds, durationSeconds } = req.body || {};

    const pos = Number(positionSeconds);
    const dur = Number(durationSeconds);

    const video = await Video.findById(req.params.id).select(
      "_id youtubeId title description topic thumbnailUrl duration category publishedAt"
    );
    if (!video) return res.status(404).json({ message: "Video not found" });

    const safePos = Number.isFinite(pos) && pos >= 0 ? pos : 0;
    const safeDur = Number.isFinite(dur) && dur > 0 ? dur : 0;

    const progress = safeDur > 0 ? Math.max(0, Math.min(1, safePos / safeDur)) : 0;

    const up = await WatchProgress.findOneAndUpdate(
      { userId: req.userId, videoId: video._id },
      {
        $set: {
          youtubeId: video.youtubeId,
          positionSeconds: safePos,
          durationSeconds: safeDur,
          progress,
          lastWatchedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    ).lean();

    // ✅ Auto-complete at 80%
    const THRESHOLD = 0.8;
    let autoCompleted = false;

    if (progress >= THRESHOLD) {
      await CompletedVideo.findOneAndUpdate(
        { userId: req.userId, videoId: video._id },
        {
          $setOnInsert: {
            userId: req.userId,
            videoId: video._id,
            youtubeId: video.youtubeId,
            completedAt: new Date(),
          },
          $set: {
            progressAtComplete: progress,
            videoSnapshot: snapshotFromVideo(video),
          },
        },
        { upsert: true, new: true }
      );
      autoCompleted = true;
    }

    res.json({ progress: up, autoCompleted });
  } catch (e) {
    console.error("POST /api/videos/:id/progress error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// -----------------------------
// ✅ Manual complete/uncomplete
// -----------------------------
router.post("/:id/complete", requireAuth, async (req, res) => {
  try {
    const { progressAtComplete } = req.body || {};
    const p = Number(progressAtComplete);
    const safeP = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 1;

    const video = await Video.findById(req.params.id).select(
      "_id youtubeId title description topic thumbnailUrl duration category publishedAt"
    );
    if (!video) return res.status(404).json({ message: "Video not found" });

    const doc = await CompletedVideo.findOneAndUpdate(
      { userId: req.userId, videoId: video._id },
      {
        $setOnInsert: {
          userId: req.userId,
          videoId: video._id,
          youtubeId: video.youtubeId,
          completedAt: new Date(),
        },
        $set: {
          progressAtComplete: safeP,
          videoSnapshot: snapshotFromVideo(video),
        },
      },
      { upsert: true, new: true }
    ).lean();

    res.json({ completed: true, item: doc });
  } catch (e) {
    console.error("POST /api/videos/:id/complete error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id/complete", requireAuth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).select("_id");
    if (!video) return res.status(404).json({ message: "Video not found" });

    await CompletedVideo.deleteOne({ userId: req.userId, videoId: video._id });
    res.json({ completed: false });
  } catch (e) {
    console.error("DELETE /api/videos/:id/complete error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// -----------------------------
// ✅ Completed list (cross-device)
// -----------------------------
router.get("/me/completed", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);

    const docs = await CompletedVideo.find({ userId: req.userId })
      .sort({ completedAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    // Return snapshot as `video` for easy FlatList usage
    const items = docs.map((d) => ({
      ...d.videoSnapshot,
      completedAt: d.completedAt,
      progressAtComplete: d.progressAtComplete,
      _completedId: d._id,
    }));

    res.json({ items });
  } catch (e) {
    console.error("GET /api/videos/me/completed error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// -----------------------------
// ✅ Comments (discussion section)
// -----------------------------
router.get("/:id/comments", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "30", 10), 100);

    const video = await Video.findById(req.params.id).select("_id");
    if (!video) return res.status(404).json({ message: "Video not found" });

    const docs = await VideoComment.find({ videoId: video._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    res.json({ comments: docs });
  } catch (e) {
    console.error("GET /api/videos/:id/comments error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/comments", requireAuth, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ message: "Text required" });

    const video = await Video.findById(req.params.id).select("_id");
    if (!video) return res.status(404).json({ message: "Video not found" });

    const u = await User.findById(req.userId).select("_id fullName email").lean();
    if (!u) return res.status(401).json({ message: "User not found" });

    const doc = await VideoComment.create({
      videoId: video._id,
      userId: req.userId,
      text,
      userSnapshot: {
        fullName: u.fullName || "",
        email: u.email || "",
      },
    });

    res.status(201).json({ comment: doc });
  } catch (e) {
    console.error("POST /api/videos/:id/comments error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
