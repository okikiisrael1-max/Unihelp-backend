import { Router } from "express";
import { admin, db } from "../firebase/firebaseAdmin.js";
import { authenticateFirebaseUser } from "../middleware/auth.js";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const router = Router();

// Configure multer for in-memory file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024, // 500 KB max
  },
  fileFilter: (_req, file, cb) => {
    // Only allow audio files
    const allowedMimes = [
      "audio/m4a",
      "audio/mp4",
      "audio/aac",
      "audio/x-m4a",
      "audio/mpeg",
      "audio/3gpp",
      "audio/3gpp2",
      "audio/ogg",
      "audio/webm",
      "audio/wav",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed."), false);
    }
  },
});

/**
 * POST /api/voice/upload
 * Upload a voice message recording.
 * Requires:
 * - Firebase auth token (Bearer)
 * - Premium subscription
 * - Audio file (max 500KB)
 * - conversationId in body
 *
 * Returns: { success, audioUrl, duration, publicId }
 */
router.post(
  "/upload",
  authenticateFirebaseUser,
  upload.single("audio"),
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const { conversationId, duration } = req.body;
      const file = req.file;

      // --- Validation ---

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "Audio file is required.",
        });
      }

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          error: "conversationId is required.",
        });
      }

      // Verify user is premium
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({
          success: false,
          error: "User not found.",
        });
      }

      const userData = userDoc.data();
      const isPremium = Boolean(
        userData.premium && userData.subscriptionStatus !== "expired"
      );

      if (!isPremium) {
        return res.status(403).json({
          success: false,
          error: "Voice messages are available for Premium members only.",
        });
      }

      // Verify user is a member of the conversation
      const conversationDoc = await db
        .collection("conversations")
        .doc(conversationId)
        .get();
      if (!conversationDoc.exists) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found.",
        });
      }

      const conversationData = conversationDoc.data();
      const memberIds = conversationData.memberIds || [];
      if (!memberIds.includes(uid)) {
        return res.status(403).json({
          success: false,
          error: "You are not a member of this conversation.",
        });
      }

      // Validate duration (max 60 seconds)
      const parsedDuration = Math.min(Math.max(0, Number(duration) || 0), 60);

      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video", // Cloudinary uses 'video' for audio files
            folder: "unihelp/voice",
            format: "m4a",
            transformation: [
              {
                audio_codec: "aac",
                audio_frequency: "22050",
                audio_channels: "1",
                bit_rate: "32000",
                quality: "30",
              },
            ],
            public_id: `voice_${uid}_${Date.now()}`,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        uploadStream.end(file.buffer);
      });

      return res.status(200).json({
        success: true,
        audioUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        duration: parsedDuration,
        bytes: uploadResult.bytes,
      });
    } catch (error) {
      console.error("[voice] Upload error:", error);

      if (
        error.message === "File too large" ||
        error.code === "LIMIT_FILE_SIZE"
      ) {
        return res.status(413).json({
          success: false,
          error: "Audio file exceeds the 500 KB limit.",
        });
      }

      if (error.message === "Only audio files are allowed.") {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: "Voice upload failed.",
      });
    }
  }
);

export default router;