// server.js
require('dotenv').config();
const { exec } = require("child_process");
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');


const profileRoutes = require("./routes/profile");
const authRoutes = require('./routes/auth');
const videosRoutes = require("./routes/videos");
const qtRoutes = require("./routes/qt");
const completedRoutes = require("./routes/completed");
const bookmarkRoutes = require("./routes/bookmarks");
const path = require("path");

const app = express();
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Middlewares
app.use(cors()); // you can restrict origin later
app.use(express.json());

// Routes

app.post("/api/admin/youtube/sync", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!process.env.SYNC_SECRET) {
    return res.status(500).json({ message: "SYNC_SECRET not set" });
  }
  if (token !== process.env.SYNC_SECRET) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const years = req.query.years ? String(req.query.years) : "2026";
  const excludeShorts =
    req.query.excludeShorts !== undefined
      ? String(req.query.excludeShorts)
      : "false";

  const cmd = `node scripts/syncYoutubeByYears.js --years=${years} --excludeShorts=${excludeShorts}`;

  exec(cmd, { cwd: __dirname }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({
        ok: false,
        error: String(err),
        stdout: stdout || "",
        stderr: stderr || "",
      });
    }
    return res.json({
      ok: true,
      stdout: stdout || "",
      stderr: stderr || "",
    });
  });
});

app.use("/api/profile", profileRoutes);
app.use('/api/auth', authRoutes);
app.use("/api/videos", videosRoutes);
app.use("/api/qt", qtRoutes);
app.use("/api/completed", completedRoutes);
app.use("/api/bookmarks", bookmarkRoutes);

// Health check
app.get('/', (req, res) => {
  res.send('Odisha API is running');
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Connect DB & start server
const PORT = process.env.PORT || 5001;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });



