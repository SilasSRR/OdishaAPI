// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      default: "",
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      default: "local",
      enum: ["local"],
    },
    // models/User.js (add inside schema)
    profilePhotoUrl: { 
      type: String, 
      default: "", 
    },
    profilePhotoKey: { 
      type: String, 
      default: "", 
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
