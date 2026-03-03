// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require("../middleware/auth");
const cloudinary = require("cloudinary").v2;

const CompletedVideo = require("../models/CompletedVideo"); // adjust
const Bookmark = require("../models/Bookmark");         // adjust
const WatchProgress = require("../models/WatchProgress"); // adjust
const VideoComment = require("../models/VideoComment"); // adjust

const DeletedAccountLog = require("../models/DeletedAccountLog");

const router = express.Router();


// Helper to generate JWT
function generateToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


// =====================
//  EMAIL/PASSWORD AUTH
// =====================

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    const fullNameNorm = String(fullName || "").trim().replace(/\s+/g, " ");
    const emailNorm = String(email || "").trim().toLowerCase();

    if (!fullName || !email || !password || password.length < 4) {
      return res.status(400).json({ message: "Invalid name, email or password" });
    }

    const existing = await User.findOne({ email: emailNorm });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName: fullNameNorm,
      email: emailNorm,
      passwordHash,
      provider: "local",
    });

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        provider: user.provider,
      },
    });

  } catch (err) {
    console.error('Register error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const emailNorm = String(email || "").trim().toLowerCase();

    const user = await User.findOne({ email: emailNorm });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        provider: user.provider,
      },
    });

  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/change-password
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.provider !== "local" || !user.passwordHash) {
      return res.status(400).json({ message: "Password change not available for this account" });
    }

    const ok = await bcrypt.compare(String(currentPassword || ""), user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Current password is incorrect" });

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(String(newPassword), salt);
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/auth/me  (permanent delete + production audit log)
router.delete("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    // accept optional reason + metadata
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    const platform = String(req.body?.platform || "").trim().slice(0, 50);

    const user = await User.findById(userId).select("profilePhotoKey fullName email");
    if (!user) return res.status(404).json({ message: "User not found" });

    // 0) write deletion log FIRST (so even if later steps fail, you still have audit trail)
    await DeletedAccountLog.create({
      userId,
      email: user.email || "",
      fullName: user.fullName || "",
      reason,
      platform,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
      ip:
        String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
          .split(",")[0]
          .trim()
          .slice(0, 80),
      deletedAt: new Date(),
    });

    // 1) delete cloudinary profile image
    if (user.profilePhotoKey) {
      try {
        await cloudinary.uploader.destroy(user.profilePhotoKey);
      } catch { }
    }

    // 2) delete private per-user data
    await Promise.allSettled([
      Bookmark.deleteMany({ userId }),
      CompletedVideo.deleteMany({ userId }),
      WatchProgress.deleteMany({ userId }),
    ]);

    // 3) anonymize public comments (keep comment text; userId stays because required)
    await VideoComment.updateMany(
      { userId },
      {
        $set: {
          "userSnapshot.fullName": "Deleted user",
          "userSnapshot.email": "",
        },
      }
    );

    // 4) delete user
    await User.deleteOne({ _id: userId });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("_id email provider fullName profilePhotoUrl");
    if (!user) return res.status(401).json({ message: "User not found" });

    res.json({
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        provider: user.provider,
        profilePhotoUrl: user.profilePhotoUrl || "",
      },
    });

  } catch (err) {
    console.error("Me error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =====================
//     GOOGLE AUTH
// =====================

// POST /api/auth/google
// (Removed Google auth routes as per recent edits)

module.exports = router;
