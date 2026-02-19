// models/VideoComment.js
const mongoose = require("mongoose");

const videoCommentSchema = new mongoose.Schema(
  {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    text: { type: String, required: true, trim: true, maxlength: 2000 },

    userSnapshot: {
      fullName: { type: String, default: "" },
      email: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

videoCommentSchema.index({ videoId: 1, createdAt: -1 });

module.exports = mongoose.model("VideoComment", videoCommentSchema);
