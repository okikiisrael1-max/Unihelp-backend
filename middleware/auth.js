import { admin } from "../firebase/firebaseAdmin.js";

export const authenticateFirebaseUser = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    console.error("[auth] Failed to verify Firebase token", error);
    res.status(401).json({ success: false, error: "Invalid authentication token" });
  }
};
