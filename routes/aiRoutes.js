import express from 'express';
import { authenticateFirebaseUser } from '../middleware/auth.js';
import { processAiChat, processStudyQuery } from '../services/aiService.js';
import { getAiUsageStatus, consumeAiUsage } from '../services/aiUsageService.js';

const router = express.Router();

const MAX_PROMPT_LENGTH = 6000;

/* =========================================================
   POST /api/ai/chat
   Unified AI chat endpoint with tool calling support.
   All AI requests go through here.
========================================================= */

router.post('/chat', authenticateFirebaseUser, async (req, res) => {
  try {
    const { prompt, attachment = null, history = [] } = req.body || {};
    const user = req.user || {};
    const profile = req.body?.profile || {};

    if (!prompt?.trim()) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Prompt is too long. Keep it under ${MAX_PROMPT_LENGTH} characters.`,
      });
    }

    // Check and consume usage
    const uid = user.uid || profile?.uid || profile?.id;
    const isPremium = Boolean(profile?.premium);

    const usageCheck = await getAiUsageStatus(uid, isPremium);
    if (!usageCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `You have reached your AI limit for today (${usageCheck.used}/${usageCheck.limit}). ${isPremium ? '' : 'Upgrade to Premium for more messages.'}`,
        usage: usageCheck,
      });
    }

    const result = await processAiChat({ prompt, profile: { ...profile, uid }, attachment, history });

    // Consume usage after successful AI call
    const updatedUsage = await consumeAiUsage(uid, isPremium);

    return res.status(200).json({
      success: true,
      answer: result.answer,
      toolResults: result.toolResults || [],
      usage: updatedUsage,
    });
  } catch (error) {
    console.error('[aiRoutes] Chat failed:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'AI request failed. Please try again.',
    });
  }
});

/* =========================================================
   POST /api/ai/study
   Legacy simple study query (no tool calling).
   Kept for backward compatibility.
========================================================= */

router.post('/study', authenticateFirebaseUser, async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const profile = req.body?.profile || {};
    const attachment = req.body?.attachment || {};
    const user = req.user || {};

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Prompt is too long. Keep it under ${MAX_PROMPT_LENGTH} characters.`,
      });
    }

    const uid = user.uid || profile?.uid || profile?.id;
    const isPremium = Boolean(profile?.premium);

    const usageCheck = await getAiUsageStatus(uid, isPremium);
    if (!usageCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `You have reached your AI limit for today (${usageCheck.used}/${usageCheck.limit}).`,
        usage: usageCheck,
      });
    }

    const result = await processStudyQuery({ prompt, profile: { ...profile, uid }, attachment });
    const updatedUsage = await consumeAiUsage(uid, isPremium);

    return res.status(200).json({
      success: true,
      answer: result.answer,
      usage: updatedUsage,
    });
  } catch (error) {
    console.error('[aiRoutes] Study failed:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'AI request failed. Please try again.',
    });
  }
});

/* =========================================================
   GET /api/ai/usage
   Fetch current AI usage status.
========================================================= */

router.post('/usage', authenticateFirebaseUser, async (req, res) => {
  try {
    const user = req.user || {};
    const profile = req.body?.profile || {};
    const uid = user.uid || profile?.uid;
    const isPremium = Boolean(profile?.premium);

    const usage = await getAiUsageStatus(uid, isPremium);
    return res.status(200).json({ success: true, usage });
  } catch (error) {
    console.error('[aiRoutes] Usage fetch failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch AI usage status.',
    });
  }
});

export default router;