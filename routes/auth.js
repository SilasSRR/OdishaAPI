// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();


// Helper to generate JWT
function generateToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

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


// GET /api/auth/me (optional)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select("_id email provider fullName profilePhotoUrl");

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

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
    console.error('Me error', err);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// =====================
//     GOOGLE AUTH
// =====================

// POST /api/auth/google
// (Removed Google auth routes as per recent edits)

module.exports = router;
