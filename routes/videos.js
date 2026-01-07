const express = require("express");
const mongoose = require("mongoose");
const Video = require("../models/Video"); // or "../models/Video" (match your filename)

const router = express.Router();

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

module.exports = router;
