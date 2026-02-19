// models/Bookmark.js
const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true, index: true },

    // ✅ store snapshot for FlatList display
    videoSnapshot: { type: Object, default: {} },

    bookmarkedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// one bookmark per (user, video)
bookmarkSchema.index({ userId: 1, videoId: 1 }, { unique: true });

module.exports = mongoose.model("Bookmark", bookmarkSchema);
