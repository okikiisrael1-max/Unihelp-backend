import express from "express";

import { admin, db, messaging } from "../firebase/firebaseAdmin.js";

const router = express.Router();

const chunkArray = (items = [], size = 500) => {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
};

router.post("/broadcast", async (req, res) => {
  try {
    const {
      title,
      body,
      category = "General",
      announcementId = null,
      url = "/announcements",
    } = req.body || {};

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required.",
      });
    }

    const usersSnap = await db.collection("users").get();
    const recipients = [];
    const targetUsers = [];

    usersSnap.forEach((doc) => {
      const user = doc.data() || {};
      const token = user.fcmToken;
      const notificationsEnabled =
        user.notificationsEnabled !== false &&
        user.notifications?.enabled !== false;

      if (!notificationsEnabled) return;

      targetUsers.push({
        userId: doc.id,
      });

      if (!token) return;

      recipients.push({
        userId: doc.id,
        token,
      });
    });

    const recipientTokens = [...new Set(recipients.map((item) => item.token))];
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        type: "announcement",
        category,
        announcementId: announcementId || "",
        url,
      },
      webpush: {
        fcmOptions: {
          link: url,
        },
      },
    };

    let sent = 0;

    if (recipientTokens.length > 0) {
      for (const tokenChunk of chunkArray(recipientTokens, 500)) {
        const response = await messaging.sendEachForMulticast({
          ...message,
          tokens: tokenChunk,
        });

        sent += response.successCount || 0;
      }
    }

    const batchChunks = chunkArray(targetUsers, 450);

    for (const batchRecipients of batchChunks) {
      const batch = db.batch();

      batchRecipients.forEach((recipient) => {
        const notificationRef = db.collection("notifications").doc();

        batch.set(notificationRef, {
          userId: recipient.userId,
          title,
          message: body,
          category,
          announcementId,
          url,
          read: false,
          type: "announcement",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();
    }

    return res.status(200).json({
      success: true,
      message: "Notification broadcast completed.",
      recipients: recipients.length,
      sent,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Failed to broadcast notification.",
    });
  }
});

export default router;
