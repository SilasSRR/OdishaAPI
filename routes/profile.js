// routes/profile.js
const express = require("express");
const multer = require("multer");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "odisha/profile",
    public_id: `${req.userId}-${Date.now()}`,
    resource_type: "image",
  }),
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});

router.post("/photo", requireAuth, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  // delete old image
  if (user.profilePhotoKey) {
    try {
      await cloudinary.uploader.destroy(user.profilePhotoKey);
    } catch {}
  }

  // req.file.path is the Cloudinary URL
  user.profilePhotoUrl = req.file.path;
  // req.file.filename is the Cloudinary public_id
  user.profilePhotoKey = req.file.filename;

  await user.save();
  return res.json({ photoUrl: user.profilePhotoUrl });
});

router.delete("/photo", requireAuth, async (req, res) => {
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
});

module.exports = router;