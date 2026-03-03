// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require("node-cron");

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

// ---------------- YouTube Auto-Sync Cron Job ----------------

const { exec } = require("child_process");

cron.schedule("*/30 * * * *", () => {
  console.log("Running YouTube auto-sync...");

  exec(
    "node scripts/syncYoutubeByYears.js --years=2026 --excludeShorts=false",
    { cwd: __dirname },
    (err, stdout, stderr) => {
      if (err) {
        console.error("Sync error:", err);
        return;
      }
      console.log(stdout);
    }
  );
});



