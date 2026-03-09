const mongoose = require("mongoose");

const SyncStateSchema = new mongoose.Schema(
{
  key: { type: String, required: true, unique: true },
  lastSyncedAt: { type: Date, default: null },
},
{ timestamps: true }
);

module.exports = mongoose.model("SyncState", SyncStateSchema);