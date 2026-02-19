const mongoose = require("mongoose");

const completedSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true, index: true },

    // ✅ store snapshot for FlatList display (title, thumb, duration, etc.)
    videoSnapshot: { type: Object, default: {} },

    // optional metadata
    progressAtComplete: { type: Number, default: 1 }, // 0..1
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// one completed per (user, video)
completedSchema.index({ userId: 1, videoId: 1 }, { unique: true });

module.exports = mongoose.model("Completed", completedSchema);
