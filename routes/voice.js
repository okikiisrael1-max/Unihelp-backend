import { Router } from "express";
import { admin, db } from "../firebase/firebaseAdmin.js";
import { authenticateFirebaseUser } from "../middleware/auth.js";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

const buildVoiceDeletePayload = (messageDoc) => {
  const data = messageDoc?.data?.() || {};
  const publicId = data.cloudinaryPublicId || data.publicId || null;
  const resourceType = data.cloudinaryResourceType || data.resourceType || "video";
  const fallbackFromUrl = typeof data.audioUrl === "string" && data.audioUrl.includes("res.cloudinary.com")
    ? data.audioUrl
    : null;
  return {
    publicId,
    resourceType,
    url: fallbackFromUrl,
  };
};

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
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
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

router.post(
  "/upload",
  authenticateFirebaseUser,
  upload.single("audio"),
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const { conversationId, duration } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ success: false, error: "Audio file is required." });
      }

      if (!conversationId) {
        return res.status(400).json({ success: false, error: "conversationId is required." });
      }

      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ success: false, error: "User not found." });
      }

      const userData = userDoc.data();
      const isPremium = Boolean(userData.premium && userData.subscriptionStatus !== "expired");
      if (!isPremium) {
        return res.status(403).json({ success: false, error: "Voice messages are available for Premium members only." });
      }

      const conversationDoc = await db.collection("conversations").doc(conversationId).get();
      if (!conversationDoc.exists) {
        return res.status(404).json({ success: false, error: "Conversation not found." });
      }

      const conversationData = conversationDoc.data();
      const memberIds = conversationData.memberIds || [];
      if (!memberIds.includes(uid)) {
        return res.status(403).json({ success: false, error: "You are not a member of this conversation." });
      }

      const parsedDuration = Math.min(Math.max(0, Number(duration) || 0), 60);

      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video",
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

      if (error.message === "File too large" || error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, error: "Audio file exceeds the 2 MB limit." });
      }

      if (error.message === "Only audio files are allowed.") {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.status(500).json({ success: false, error: "Voice upload failed." });
    }
  }
);

router.delete(
  "/:conversationId/:messageId",
  authenticateFirebaseUser,
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const { conversationId, messageId } = req.params;

      const messageRef = db.collection("conversations").doc(conversationId).collection("messages").doc(messageId);
      const messageDoc = await messageRef.get();

      if (!messageDoc.exists) {
        return res.status(404).json({ success: false, error: "Voice message not found." });
      }

      const messageData = messageDoc.data();
      if (messageData.senderId !== uid) {
        return res.status(403).json({ success: false, error: "You can only delete your own voice messages." });
      }

      const deletePayload = buildVoiceDeletePayload(messageDoc);
      if (deletePayload.publicId) {
        try {
          await cloudinary.uploader.destroy(deletePayload.publicId, {
            resource_type: deletePayload.resourceType,
          });
        } catch (cloudinaryError) {
          console.warn("[voice] Cloudinary delete failed:", cloudinaryError);
        }
      } else if (deletePayload.url) {
        try {
          const parsedPublicId = deletePayload.url.split("/").slice(-1)[0]?.split(".")[0];
          if (parsedPublicId) {
            await cloudinary.uploader.destroy(parsedPublicId, { resource_type: deletePayload.resourceType });
          }
        } catch (cloudinaryError) {
          console.warn("[voice] Cloudinary delete from URL failed:", cloudinaryError);
        }
      }

      await messageRef.update({
        deleted: true,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        text: "",
        audioUrl: "",
        cloudinaryPublicId: "",
        cloudinaryResourceType: "",
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[voice] Delete error:", error);
      return res.status(500).json({ success: false, error: "Failed to delete voice message." });
    }
  }
);

export default router;