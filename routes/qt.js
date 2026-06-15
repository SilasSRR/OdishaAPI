// routes/qt.js
const express = require("express");
const Video = require("../models/Video"); // match your filename
const router = express.Router();

// Nepal timezone is UTC +05:45
function getNepalTodayYYYYMMDD() {
  const now = new Date();
  const nepalMs = now.getTime() + (5 * 60 + 45) * 60 * 1000;
  const nepal = new Date(nepalMs);

  const y = nepal.getUTCFullYear();
  const m = String(nepal.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nepal.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// GET /api/qt/today
router.get("/today", async (req, res) => {
  try {
    const qtDate = getNepalTodayYYYYMMDD();

    const videos = await Video.find({
      category: "QT",
      qtDate,
      youtubeId: { $ne: "REPLACE_ME" },
    })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(50)
      .select("_id title youtubeId description topic thumbnailUrl duration category qtDate publishedAt");

    res.json({ qtDate, videos });
  } catch (e) {
    console.error("GET /api/qt/today error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
