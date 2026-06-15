const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const cloudinary = require("cloudinary").v2;

const CompletedVideo = require("../models/CompletedVideo");
const Bookmark = require("../models/Bookmark");
const WatchProgress = require("../models/WatchProgress");
const VideoComment = require("../models/VideoComment");

const DeletedAccountLog = require("../models/DeletedAccountLog");

const router = express.Router();

function generateToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeFullName(fullName) {
  return String(fullName || "").trim().replace(/\s+/g, " ");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validatePassword(password) {
  const pw = String(password || "");

  if (pw.length < 8) {
    return "Password must be at least 8 characters";
  }

  if (!/[A-Za-z]/.test(pw)) {
    return "Password must include at least one letter";
  }

  if (!/\d/.test(pw)) {
    return "Password must include at least one number";
  }

  return "";
}

// =====================
//  EMAIL/PASSWORD AUTH
// =====================

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    const fullNameNorm = normalizeFullName(fullName);
    const emailNorm = normalizeEmail(email);

    if (fullNameNorm.length < 2) {
      return res.status(400).json({ message: "Full name must be at least 2 characters" });
    }

    if (fullNameNorm.length > 80) {
      return res.status(400).json({ message: "Full name must be 80 characters or less" });
    }

    if (!isValidEmail(emailNorm)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const existing = await User.findOne({ email: emailNorm });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(password), salt);

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
    console.error("Register error", err);

    if (err?.code === 11000) {
      return res.status(409).json({ message: "Email already in use" });
    }

    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const emailNorm = normalizeEmail(email);

    if (!isValidEmail(emailNorm) || !password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = await User.findOne({ email: emailNorm });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
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
    console.error("Login error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/change-password
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
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

// DELETE /api/auth/me
router.delete("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    const platform = String(req.body?.platform || "").trim().slice(0, 50);

    const user = await User.findById(userId).select("profilePhotoKey fullName email");
    if (!user) return res.status(404).json({ message: "User not found" });

    await DeletedAccountLog.create({
      userId,
      email: user.email || "",
      fullName: user.fullName || "",
      reason,
      platform,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
      ip: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
        .split(",")[0]
        .trim()
        .slice(0, 80),
      deletedAt: new Date(),
    });

    if (user.profilePhotoKey) {
      try {
        await cloudinary.uploader.destroy(user.profilePhotoKey);
      } catch {}
    }

    await Promise.allSettled([
      Bookmark.deleteMany({ userId }),
      CompletedVideo.deleteMany({ userId }),
      WatchProgress.deleteMany({ userId }),
    ]);

    await VideoComment.updateMany(
      { userId },
      {
        $set: {
          "userSnapshot.fullName": "Deleted user",
          "userSnapshot.email": "",
        },
      }
    );

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
    const user = await User.findById(req.userId).select(
      "_id email provider fullName profilePhotoUrl"
    );

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






module.exports = router;
