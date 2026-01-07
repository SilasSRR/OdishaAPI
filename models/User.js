// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // For local (email/password) users
    passwordHash: {
      type: String, // not required – can be empty for Google users
    },
    // For Google login
    googleId: {
      type: String,
    },
    provider: {
      type: String,
      default: 'local', // 'local', 'google', 'local-google', etc.
    },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

module.exports = User;
