// routes/profile.js
const express = require("express");
const multer = require("multer");

const { requireAuth } = require("../middleware/auth");
const User = require("../models/User");
const cloudinary = require("cloudinary").v2;


const router = express.Router();

// Cloudinary config (env vars in Render)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer: keep file in memory (no disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.mimetype);
    cb(ok ? null : new Error("Only image files are allowed"), ok);
  },
});

// GET my profile
router.get("/me", requireAuth, async (req, res) => {
  const me = await User.findById(req.userId).select("email provider profilePhotoUrl fullName");
  return res.json({ user: me });
});

// POST upload profile photo
router.post("/photo", requireAuth, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // delete old cloudinary image if we stored a key
    if (user.profilePhotoKey) {
      try {
        await cloudinary.uploader.destroy(user.profilePhotoKey);
      } catch {}
    }

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "odisha/profile",
          resource_type: "image",
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    user.profilePhotoUrl = uploadResult.secure_url;
    user.profilePhotoKey = uploadResult.public_id; // for deletion later
    await user.save();

    return res.json({ photoUrl: user.profilePhotoUrl });
  } catch (e) {
    console.error("Upload photo error:", e);
    return res.status(500).json({ message: "Failed to upload photo" });
  }
});

// DELETE profile photo
router.delete("/photo", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.profilePhotoKey) {
      try {
        await cloudinary.uploader.destroy(user.profilePhotoKey);
      } catch {}
    }

    user.profilePhotoUrl = "";
    user.profilePhotoKey = "";
    await user.save();

    return res.json({ ok: true });
  } catch (e) {
    console.error("Delete photo error:", e);
    return res.status(500).json({ message: "Failed to delete photo" });
  }
});

module.exports = router;