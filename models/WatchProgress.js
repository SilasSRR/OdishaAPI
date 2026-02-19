// models/WatchProgress.js
const mongoose = require("mongoose");

const watchProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true, index: true },

    // convenience fields (optional but useful)
    youtubeId: { type: String, default: "" },

    positionSeconds: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    progress: { type: Number, default: 0 }, // 0..1

    lastWatchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

watchProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true });

module.exports = mongoose.model("WatchProgress", watchProgressSchema);
