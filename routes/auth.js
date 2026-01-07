// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const router = express.Router();

// Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

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
    const { email, password } = req.body;

    if (!email || !password || password.length < 4) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      provider: 'local',
    });

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
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

    const user = await User
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash provider email');

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.passwordHash) {
      return res.status(400).json({
        message: 'This account has no password set. Please reset password or re-register.',
      });
    }

    if (!password) {
      return res.status(400).json({ message: 'Password missing' });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
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

    const user = await User.findById(decoded.userId).select('_id email provider');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    res.json({ user: { id: user._id, email: user.email, provider: user.provider } });
  } catch (err) {
    console.error('Me error', err);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// =====================
//     GOOGLE AUTH
// =====================

// POST /api/auth/google
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Missing idToken' });
    }

    // Verify token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_WEB_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const emailVerified = payload.email_verified;
    const name = payload.name;
    const picture = payload.picture;

    if (!email || !emailVerified) {
      return res.status(400).json({ message: 'Email not verified by Google' });
    }

    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Create new Google user
      user = await User.create({
        email: email.toLowerCase(),
        googleId,
        provider: 'google',
      });
    } else {
      // Link Google info if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
      }
      if (!user.provider.includes('google')) {
        user.provider = user.provider === 'local' ? 'local-google' : user.provider;
      }
      await user.save();
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        provider: user.provider,
        name: name || user.email,
        picture,
      },
    });
  } catch (err) {
    console.error('Google auth error', err);
    res.status(401).json({ message: 'Invalid Google token' });
  }
});

module.exports = router;
