// models/Video.js
const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    youtubeId: { type: String, required: true, trim: true, unique: true, index: true },
    category: { type: String, required: true, enum: ["QT", "Live", "Other"] },

    // NEW
    sourceChannelId: { type: String, default: "", index: true },

    // QT day grouping
    qtDate: { type: String, default: "" }, // "YYYY-MM-DD"

    description: { type: String, default: "" },
    topic: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "" },
    duration: { type: String, default: "" },
    publishedAt: { type: Date, required: true, default: Date.now },
    notificationSentAt: {
      type: Date,
      default: null,
    },
  },

  { timestamps: true }
);

videoSchema.index({ category: 1, qtDate: 1, publishedAt: -1, _id: -1 });

module.exports = mongoose.model("Video", videoSchema);
