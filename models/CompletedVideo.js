// models/CompletedVideo.js
const mongoose = require("mongoose");

const completedVideoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true, index: true },

    youtubeId: { type: String, default: "" },

    completedAt: { type: Date, default: Date.now },
    progressAtComplete: { type: Number, default: 1 },

    // ✅ snapshot for fast list rendering (cross-device)
    videoSnapshot: {
      _id: { type: mongoose.Schema.Types.ObjectId },
      title: { type: String, default: "" },
      youtubeId: { type: String, default: "" },
      description: { type: String, default: "" },
      topic: { type: String, default: "" },
      thumbnailUrl: { type: String, default: "" },
      duration: { type: String, default: "" },
      category: { type: String, default: "" },
      publishedAt: { type: Date },
    },
  },
  { timestamps: true }
);

completedVideoSchema.index({ userId: 1, videoId: 1 }, { unique: true });
completedVideoSchema.index({ userId: 1, completedAt: -1 });

module.exports = mongoose.model("CompletedVideo", completedVideoSchema);
