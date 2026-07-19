import express from "express";

import { authenticateFirebaseUser } from "../middleware/auth.js";
import { admin, db, messaging } from "../firebase/firebaseAdmin.js";
import { sendNotification } from "../utils/expoPush.js";

const router = express.Router();

const chunkArray = (items = [], size = 500) => {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
};

const buildMessagePayload = ({
  title,
  body,
  type = "general",
  category = "General",
  url = "/",
  announcementId = null,
}) => ({
  notification: {
    title,
    body,
  },
  data: {
    type,
    category,
    announcementId: announcementId || "",
    url,
    title,
    body,
    message: body,
  },
  webpush: {
    notification: {
      title,
      body,
    },
    fcmOptions: {
      link: url,
    },
  },
});

export const sendStudyReminderNotifications = async () => {
  try {
    const now = new Date();
    const inactiveSince = new Date(now.getTime() - 15 * 60 * 60 * 1000);
    const inactiveSinceTimestamp = admin.firestore.Timestamp.fromDate(inactiveSince);

    const usersSnap = await db
      .collection("users")
      .where("fcmToken", ">", "")
      .get();

    const recipients = [];

    usersSnap.forEach((docSnap) => {
      const user = docSnap.data() || {};
      const notificationsEnabled =
        user.notificationsEnabled !== false &&
        user.notifications?.enabled !== false;

      if (!notificationsEnabled || !user.fcmToken) return;

      const lastSeenAt = user.lastStudyActivityAt || user.lastActive || user.createdAt;
      const lastReminderAt = user.lastStudyReminderAt;

      if (!lastSeenAt) return;

      const lastSeenDate = lastSeenAt.toDate ? lastSeenAt.toDate() : new Date(lastSeenAt);
      const lastReminderDate = lastReminderAt?.toDate ? lastReminderAt.toDate() : null;

      if (lastSeenDate > inactiveSince) return;

      if (lastReminderDate) {
        const hoursSinceLastReminder = (now.getTime() - lastReminderDate.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastReminder < 24) return;
      }

      recipients.push({
        userId: docSnap.id,
        token: user.fcmToken,
      });
    });

    if (recipients.length === 0) {
      return { success: true, sent: 0, skipped: 0 };
    }

    const reminderPayload = buildMessagePayload({
      title: "You haven't studied today",
      body: "A quick study session now will keep your streak alive.",
      type: "study-reminder",
      category: "Reminder",
      url: "/",
    });

    let sent = 0;

    for (const batch of chunkArray(recipients, 500)) {
      const response = await messaging.sendEachForMulticast({
        ...reminderPayload,
        tokens: batch.map((item) => item.token),
      });

      sent += response.successCount || 0;

      const batchWrite = db.batch();

      batch.forEach((recipient) => {
        const notificationRef = db.collection("notifications").doc();
        batchWrite.set(notificationRef, {
          userId: recipient.userId,
          title: reminderPayload.notification.title,
          message: reminderPayload.notification.body,
          category: "Reminder",
          type: "study-reminder",
          url: "/",
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batchWrite.commit();
    }

    const reminderUpdates = recipients.map((recipient) => ({
      userId: recipient.userId,
      reminderTime: admin.firestore.FieldValue.serverTimestamp(),
    }));

    const reminderBatch = db.batch();

    reminderUpdates.forEach((item) => {
      reminderBatch.set(
        db.collection("users").doc(item.userId),
        {
          lastStudyReminderAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    await reminderBatch.commit();

    return {
      success: true,
      sent,
      recipients: recipients.length,
    };
  } catch (error) {
    console.error("Study reminder job failed:", error);
    return { success: false, error: error.message };
  }
};

router.post("/push-token", authenticateFirebaseUser, async (req, res) => {
  try {
    const { expoPushToken, deviceType = "unknown" } = req.body || {};

    if (!expoPushToken) {
      return res.status(400).json({
        success: false,
        message: "An Expo push token is required.",
      });
    }

    await db.collection("users").doc(req.user.uid).set(
      {
        expoPushToken,
        pushNotificationsEnabled: true,
        pushTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        deviceType,
      },
      { merge: true }
    );

    return res.status(200).json({
      success: true,
      message: "Push token saved.",
    });
  } catch (error) {
    console.error("Push token update failed:", error);
    return res.status(500).json({ success: false, message: "Failed to save push token." });
  }
});

router.post("/send-user", async (req, res) => {
  try {
    const {
      userIds = [],
      userId = null,
      title,
      body,
      type = "general",
      category = "General",
      url = "/",
      announcementId = null,
    } = req.body || {};

    const ids = Array.isArray(userIds) ? userIds : [userId].filter(Boolean);

    if (!title || !body || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Title, body, and at least one user are required.",
      });
    }

    const recipients = [];

    for (const uid of ids) {
      const userSnap = await db.collection("users").doc(uid).get();
      const user = userSnap.data() || {};
      const notificationsEnabled =
        user.notificationsEnabled !== false &&
        user.notifications?.enabled !== false;

      if (!notificationsEnabled) continue;

      if (user.expoPushToken) {
        recipients.push({ userId: uid, token: user.expoPushToken, pushType: "expo" });
      } else if (user.fcmToken) {
        recipients.push({ userId: uid, token: user.fcmToken, pushType: "fcm" });
      }
    }

    if (recipients.length === 0) {
      return res.status(200).json({ success: true, sent: 0, recipients: 0 });
    }

    const payload = buildMessagePayload({
      title,
      body,
      type,
      category,
      url,
      announcementId,
    });

    let sent = 0;
    const expoRecipients = recipients.filter((item) => item.pushType === "expo");
    const legacyRecipients = recipients.filter((item) => item.pushType !== "expo");

    if (expoRecipients.length > 0) {
      const expoResult = await sendNotification({
        recipients: expoRecipients.map((item) => item.token),
        title,
        body,
        data: {
          type,
          category,
          announcementId: announcementId || "",
          url,
        },
      });
      sent += expoResult.sent || 0;
    }

    if (legacyRecipients.length > 0) {
      for (const batch of chunkArray(legacyRecipients, 500)) {
        const response = await messaging.sendEachForMulticast({
          ...payload,
          tokens: batch.map((item) => item.token),
        });

        sent += response.successCount || 0;
      }
    }

    const batchWrite = db.batch();

    recipients.forEach((recipient) => {
      const notificationRef = db.collection("notifications").doc();
      batchWrite.set(notificationRef, {
        userId: recipient.userId,
        title,
        message: body,
        category,
        type,
        url,
        announcementId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batchWrite.commit();

    return res.status(200).json({ success: true, sent, recipients: recipients.length });
  } catch (error) {
    console.error("User notification send failed:", error);
    return res.status(500).json({ success: false, message: "Failed to send user notification." });
  }
});

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
      const notificationsEnabled =
        user.notificationsEnabled !== false &&
        user.notifications?.enabled !== false;

      if (!notificationsEnabled) return;

      targetUsers.push({
        userId: doc.id,
      });

      if (user.expoPushToken) {
        recipients.push({
          userId: doc.id,
          token: user.expoPushToken,
          pushType: "expo",
        });
      } else if (user.fcmToken) {
        recipients.push({
          userId: doc.id,
          token: user.fcmToken,
          pushType: "fcm",
        });
      }
    });

    const message = buildMessagePayload({
      title,
      body,
      type: "announcement",
      category,
      url,
      announcementId,
    });

    let sent = 0;

    const expoRecipients = recipients.filter((item) => item.pushType === "expo");
    const legacyRecipients = recipients.filter((item) => item.pushType !== "expo");

    if (expoRecipients.length > 0) {
      const expoResult = await sendNotification({
        recipients: expoRecipients.map((item) => item.token),
        title,
        body,
        data: {
          type: "announcement",
          category,
          announcementId: announcementId || "",
          url,
        },
      });
      sent += expoResult.sent || 0;
    }

    if (legacyRecipients.length > 0) {
      const recipientTokens = [...new Set(legacyRecipients.map((item) => item.token))];
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
