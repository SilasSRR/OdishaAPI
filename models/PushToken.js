const mongoose = require("mongoose");

const pushTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    expoPushToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    enabled: {
      type: Boolean,
      default: true,
    },

    platform: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PushToken", pushTokenSchema);