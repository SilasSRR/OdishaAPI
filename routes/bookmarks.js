// routes/bookmarks.js
const express = require("express");
const mongoose = require("mongoose");
const Bookmark = require("../models/Bookmark");
const Video = require("../models/Video");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/bookmarks -> list
router.get("/", requireAuth, async (req, res) => {
  try {
    const docs = await Bookmark.find({ userId: req.userId })
      .sort({ bookmarkedAt: -1, _id: -1 })
      .select("videoId videoSnapshot bookmarkedAt");

    const items = docs.map((d) => ({
      ...(d.videoSnapshot || {}),
      _id: d.videoId, // keep your stable id style
      bookmarkedAt: d.bookmarkedAt,
    }));

    res.json({ items });
  } catch (e) {
    console.error("GET /bookmarks error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/bookmarks/:videoId -> is bookmarked?
router.get("/:videoId", requireAuth, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!mongoose.isValidObjectId(videoId)) return res.json({ bookmarked: false });

    const exists = await Bookmark.exists({ userId: req.userId, videoId });
    res.json({ bookmarked: !!exists });
  } catch {
    res.json({ bookmarked: false });
  }
});

// POST /api/bookmarks/:videoId -> bookmark (upsert)
router.post("/:videoId", requireAuth, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({ message: "Invalid video id" });
    }

    const v = await Video.findById(videoId).select(
      "_id title youtubeId description topic thumbnailUrl duration category publishedAt qtDate"
    );
    if (!v) return res.status(404).json({ message: "Video not found" });

    const videoSnapshot = {
      _id: v._id,
      title: v.title,
      youtubeId: v.youtubeId,
      description: v.description,
      topic: v.topic,
      thumbnailUrl: v.thumbnailUrl,
      duration: v.duration,
      category: v.category,
      qtDate: v.qtDate,
      publishedAt: v.publishedAt,
    };

    await Bookmark.updateOne(
      { userId: req.userId, videoId: v._id },
      {
        $set: {
          videoSnapshot,
          bookmarkedAt: new Date(),
        },
      },
      { upsert: true }
    );

    res.json({ bookmarked: true });
  } catch (e) {
    console.error("POST /bookmarks error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/bookmarks/:videoId -> remove bookmark
router.delete("/:videoId", requireAuth, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!mongoose.isValidObjectId(videoId)) return res.json({ removed: true });

    await Bookmark.deleteOne({ userId: req.userId, videoId });
    res.json({ removed: true });
  } catch (e) {
    console.error("DELETE /bookmarks error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
