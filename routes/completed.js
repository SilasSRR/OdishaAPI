// routes/completed.js
const express = require("express");
const mongoose = require("mongoose");
const Completed = require("../models/Completed");
const Video = require("../models/Video");
const { requireAuth } = require("../middleware/auth"); // ✅ FIX

const router = express.Router();

// GET /api/completed
router.get("/", requireAuth, async (req, res) => {
  try {
    const docs = await Completed.find({ userId: req.userId })
      .sort({ completedAt: -1, _id: -1 })
      .select("videoId videoSnapshot completedAt progressAtComplete");

    // return snapshots directly (easy for FlatList)
    const items = docs.map((d) => ({
      ...(d.videoSnapshot || {}),
      _id: d.videoId, // keep your stable id style
      completedAt: d.completedAt,
      progressAtComplete: d.progressAtComplete,
    }));

    res.json({ items });
  } catch (e) {
    console.error("GET /completed error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/completed/:videoId -> is completed?
router.get("/:videoId", requireAuth, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!mongoose.isValidObjectId(videoId)) return res.json({ completed: false });

    const exists = await Completed.exists({ userId: req.userId, videoId });
    res.json({ completed: !!exists });
  } catch {
    res.json({ completed: false });
  }
});

// POST /api/completed/:videoId -> mark completed (upsert)
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

    const progressAtComplete = Math.max(0, Math.min(1, Number(req.body?.progressAtComplete ?? 1)));

    // ✅ snapshot stored in DB
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

    await Completed.updateOne(
      { userId: req.userId, videoId: v._id },
      {
        $set: {
          videoSnapshot,
          progressAtComplete,
          completedAt: new Date(),
        },
      },
      { upsert: true }
    );

    res.json({ completed: true });
  } catch (e) {
    console.error("POST /completed error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/completed/:videoId -> uncomplete
router.delete("/:videoId", requireAuth, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!mongoose.isValidObjectId(videoId)) return res.json({ removed: true });

    await Completed.deleteOne({ userId: req.userId, videoId });
    res.json({ removed: true });
  } catch (e) {
    console.error("DELETE /completed error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
