// middleware/auth.js
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) return res.status(401).json({ message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.userId) return res.status(401).json({ message: "Invalid token" });

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = { requireAuth };
