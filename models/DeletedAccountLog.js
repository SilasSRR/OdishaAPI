// models/DeletedAccountLog.js
const mongoose = require("mongoose");

const deletedAccountLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, default: "" },      // snapshot (helpful later)
    fullName: { type: String, default: "" },   // snapshot
    reason: { type: String, default: "" },
    platform: { type: String, default: "" },   // optional
    userAgent: { type: String, default: "" },  // optional
    ip: { type: String, default: "" },         // optional (Render/proxies may affect)
    deletedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeletedAccountLog", deletedAccountLogSchema);