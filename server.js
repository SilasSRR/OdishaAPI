// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const videosRoutes = require("./routes/videos");
const qtRoutes = require("./routes/qt");

const app = express();

// Middlewares
app.use(cors()); // you can restrict origin later
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use("/api/videos", videosRoutes);
app.use("/api/qt", qtRoutes);

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

