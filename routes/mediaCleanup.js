import express from "express";
import { FieldValue } from "firebase-admin/firestore";

import { admin, db } from "../firebase/firebaseAdmin.js";
import { authenticateFirebaseUser } from "../middleware/auth.js";
import { deleteCloudinaryAssets } from "../utils/cloudinaryCleanup.js";
import { collectCloudinaryAssets } from "../utils/mediaAssets.js";

const router = express.Router();

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "onakomayaokiki@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const DOCUMENT_TYPES = {
  hostels: { collection: "hostels", ownerFields: ["userId"] },
  studentMarketplace: { collection: "studentMarketplace", ownerFields: ["userId"] },
  tutorials: { collection: "tutorials", ownerFields: ["tutorId"] },
  notes: { collection: "notes", ownerFields: ["uploadedBy"] },
  questions: { collection: "questions", ownerFields: ["userId"] },
  stories: { collection: "stories", ownerFields: ["authorId"] },
  purchases: { collection: "purchases", ownerFields: ["userId", "tutorId"], adminAllowed: true },
  subscriptions: { collection: "subscriptions", idIsOwner: true, adminAllowed: true },
  studyMaterials: { collection: "study_materials", adminOnly: true },
};

const isAdmin = (user) =>
  Boolean(user?.admin) || ADMIN_EMAILS.has((user?.email || "").toLowerCase());

const canDeleteDocument = ({ config, data, id, user }) => {
  if (isAdmin(user) && (config.adminAllowed || config.adminOnly)) return true;
  if (config.adminOnly) return false;
  if (config.idIsOwner && id === user.uid) return true;
  return (config.ownerFields || []).some((field) => data?.[field] === user.uid);
};

const notFound = (res) =>
  res.status(404).json({ success: false, error: "Document not found" });

const forbidden = (res) =>
  res.status(403).json({ success: false, error: "You are not authorized to delete this document" });

const cleanupThenDelete = async ({ ref, data }) => {
  const assets = collectCloudinaryAssets(data);
  console.log(`[cleanup] Found ${assets.length} Cloudinary asset candidate(s).`);
  const cloudinaryResults = await deleteCloudinaryAssets(assets);

  console.log(`[cleanup] Deleting Firestore document: ${ref.path}`);
  await ref.delete();
  console.log(`[cleanup] Firestore document deleted successfully: ${ref.path}`);

  return {
    deletedAssets: cloudinaryResults.filter((item) => item.success).length,
    skippedAssets: cloudinaryResults.filter((item) => item.skipped).length,
    failedAssets: cloudinaryResults.filter((item) => item.success === false).length,
    cloudinaryResults,
  };
};

router.use(authenticateFirebaseUser);

router.delete("/documents/:type/:id", async (req, res) => {
  try {
    const config = DOCUMENT_TYPES[req.params.type];

    if (!config) {
      return res.status(400).json({ success: false, error: "Unsupported document type" });
    }

    const ref = db.collection(config.collection).doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return notFound(res);

    const data = snap.data();
    if (!canDeleteDocument({ config, data, id: req.params.id, user: req.user })) {
      return forbidden(res);
    }

    const result = await cleanupThenDelete({ ref, data });
    console.log(`[cleanup] Cleanup completed for ${ref.path}.`);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("[cleanup] Delete document failed", error);
    res.status(500).json({
      success: false,
      error: error.message || "Unable to delete document and Cloudinary assets",
    });
  }
});

router.delete("/groups/:groupId/posts/:postId", async (req, res) => {
  try {
    const { groupId, postId } = req.params;
    const groupRef = db.collection("groups").doc(groupId);
    const postRef = groupRef.collection("posts").doc(postId);

    const [groupSnap, postSnap, memberSnap] = await Promise.all([
      groupRef.get(),
      postRef.get(),
      groupRef.collection("members").doc(req.user.uid).get(),
    ]);

    if (!groupSnap.exists || !postSnap.exists) return notFound(res);

    const post = postSnap.data();
    const role = memberSnap.exists ? memberSnap.data().role : "";
    const canManage = ["owner", "admin"].includes(role);

    if (!canManage && post.authorId !== req.user.uid) return forbidden(res);

    const result = await cleanupThenDelete({ ref: postRef, data: post });
    await groupRef.update({
      postCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
      lastActivityAt: FieldValue.serverTimestamp(),
    });

    console.log(`[cleanup] Cleanup completed for ${postRef.path}.`);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("[cleanup] Delete group post failed", error);
    res.status(500).json({ success: false, error: error.message || "Unable to delete group post" });
  }
});

router.delete("/groups/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const groupRef = db.collection("groups").doc(groupId);
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) return notFound(res);

    const group = groupSnap.data();
    if (group.ownerId !== req.user.uid && !isAdmin(req.user)) return forbidden(res);

    const assets = collectCloudinaryAssets(group);
    const [postsSnap, messagesSnap, membersSnap] = await Promise.all([
      groupRef.collection("posts").get(),
      groupRef.collection("messages").get(),
      groupRef.collection("members").get(),
    ]);

    postsSnap.forEach((entry) => collectCloudinaryAssets(entry.data(), assets));
    messagesSnap.forEach((entry) => collectCloudinaryAssets(entry.data(), assets));

    console.log(`[cleanup] Found ${assets.length} Cloudinary asset candidate(s) for group ${groupId}.`);
    const cloudinaryResults = await deleteCloudinaryAssets(assets);

    const batch = db.batch();
    membersSnap.forEach((member) => {
      batch.delete(db.collection("users").doc(member.id).collection("groups").doc(groupId));
    });
    await batch.commit();

    console.log(`[cleanup] Recursively deleting Firestore group: ${groupRef.path}`);
    await db.recursiveDelete(groupRef);
    console.log(`[cleanup] Cleanup completed for group ${groupId}.`);

    res.status(200).json({
      success: true,
      deletedAssets: cloudinaryResults.filter((item) => item.success).length,
      skippedAssets: cloudinaryResults.filter((item) => item.skipped).length,
      failedAssets: cloudinaryResults.filter((item) => item.success === false).length,
      cloudinaryResults,
    });
  } catch (error) {
    console.error("[cleanup] Delete group failed", error);
    res.status(500).json({ success: false, error: error.message || "Unable to delete group" });
  }
});

router.delete("/users/me", async (req, res) => {
  try {
    const uid = req.user.uid;
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) return notFound(res);

    const assets = collectCloudinaryAssets(userSnap.data());
    const ownedQueries = await Promise.all([
      db.collection("hostels").where("userId", "==", uid).get(),
      db.collection("studentMarketplace").where("userId", "==", uid).get(),
      db.collection("tutorials").where("tutorId", "==", uid).get(),
      db.collection("notes").where("uploadedBy", "==", uid).get(),
      db.collection("questions").where("userId", "==", uid).get(),
      db.collection("stories").where("authorId", "==", uid).get(),
    ]);

    ownedQueries.forEach((snap) => {
      snap.forEach((entry) => collectCloudinaryAssets(entry.data(), assets));
    });

    const cloudinaryResults = await deleteCloudinaryAssets(assets);

    for (const snap of ownedQueries) {
      for (const entry of snap.docs) {
        await entry.ref.delete();
      }
    }

    await userRef.delete();
    await admin.auth().deleteUser(uid);

    res.status(200).json({
      success: true,
      deletedAssets: cloudinaryResults.filter((item) => item.success).length,
      skippedAssets: cloudinaryResults.filter((item) => item.skipped).length,
      failedAssets: cloudinaryResults.filter((item) => item.success === false).length,
      cloudinaryResults,
    });
  } catch (error) {
    console.error("[cleanup] Delete user failed", error);
    res.status(500).json({ success: false, error: error.message || "Unable to delete user" });
  }
});

export default router;
