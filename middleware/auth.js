// middleware/auth.js
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const authHeader = (req.headers.authorization || "").trim();

  // Accept: "Bearer <token>" (case-insensitive), with extra spaces
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : "";

  if (!token) {
    console.log("[AUTH] Missing token. Authorization header =", authHeader);
    return res.status(401).json({ message: "No token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.userId) {
      console.log("[AUTH] Token verified but missing userId. decoded =", decoded);
      return res.status(401).json({ message: "Invalid token payload" });
    }

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (e) {
  if (e.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Token expired" });
  }
  return res.status(401).json({ message: "Invalid token" });
}
}

module.exports = { requireAuth };
