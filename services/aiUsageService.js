import { db } from '../firebase/firebaseAdmin.js';

const COLLECTION = 'ai_usage';
const DAILY_LIMITS = {
  free: 5,
  premium: 10,
};

/**
 * Get today's date as YYYY-MM-DD in Africa/Lagos timezone.
 */
function getTodayKey() {
  const now = new Date();
  const lagosOffset = 1 * 60; // UTC+1 in minutes
  const local = new Date(now.getTime() + lagosOffset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

/**
 * Get the usage limit based on user's premium status.
 */
export function getAiUsageLimit(isPremium = false) {
  return isPremium ? DAILY_LIMITS.premium : DAILY_LIMITS.free;
}

/**
 * Fetch current usage status from Firestore.
 */
export async function getAiUsageStatus(uid, isPremium = false) {
  if (!uid) {
    const limit = getAiUsageLimit(isPremium);
    return { used: 0, limit, remaining: limit, allowed: true, uid: null };
  }

  const today = getTodayKey();
  const docId = `${uid}_${today}`;

  try {
    const doc = await db.collection(COLLECTION).doc(docId).get();
    const data = doc.exists ? doc.data() : null;
    const used = data?.count || 0;
    const limit = getAiUsageLimit(isPremium);
    return { used, limit, remaining: Math.max(0, limit - used), allowed: used < limit, uid };
  } catch (error) {
    console.error('[aiUsageService] Failed to fetch usage:', error.message);
    const limit = getAiUsageLimit(isPremium);
    return { used: 0, limit, remaining: limit, allowed: true, uid };
  }
}

/**
 * Consume one AI usage slot. Returns updated status.
 */
export async function consumeAiUsage(uid, isPremium = false) {
  if (!uid) {
    const limit = getAiUsageLimit(isPremium);
    return { used: 1, limit, remaining: Math.max(0, limit - 1), allowed: true, uid: null };
  }

  const today = getTodayKey();
  const docId = `${uid}_${today}`;
  const limit = getAiUsageLimit(isPremium);

  try {
    const docRef = db.collection(COLLECTION).doc(docId);
    const result = await docRef.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const currentCount = doc.exists ? (doc.data().count || 0) : 0;

      if (currentCount >= limit) {
        return { used: currentCount, limit, remaining: 0, allowed: false, uid };
      }

      const newCount = currentCount + 1;
      transaction.set(docRef, {
        count: newCount,
        uid,
        date: today,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return { used: newCount, limit, remaining: Math.max(0, limit - newCount), allowed: true, uid };
    });

    return result;
  } catch (error) {
    console.error('[aiUsageService] Failed to consume usage:', error.message);
    return { used: 1, limit, remaining: Math.max(0, limit - 1), allowed: true, uid };
  }
}