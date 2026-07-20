import express from 'express';
import { authenticateFirebaseUser } from '../middleware/auth.js';
import { processAiChat } from '../services/aiService.js';
import { getAiUsageStatus, consumeAiUsage } from '../services/aiUsageService.js';

const router = express.Router();

/* =========================================================
   POST /api/ai/tool
   Execute a specific AI tool with real Gemini function calling.
   Used by AI widgets embedded in pages.
========================================================= */

router.post('/tool', authenticateFirebaseUser, async (req, res) => {
  try {
    const { tool, input = {}, profile = {} } = req.body || {};
    const user = req.user || {};

    if (!tool) {
      return res.status(400).json({ success: false, error: 'Tool is required' });
    }

    const uid = user.uid || profile?.uid || profile?.id;
    const isPremium = Boolean(profile?.premium);

    // Check usage
    const usageCheck = await getAiUsageStatus(uid, isPremium);
    if (!usageCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `You have reached your AI limit for today (${usageCheck.used}/${usageCheck.limit}).`,
        usage: usageCheck,
      });
    }

    // Map tool name to a natural language prompt for Gemini
    const toolPrompts = {
      summarize_notes: `Summarize the latest lecture notes. ${input?.title ? `Focus on: ${input.title}` : ''}`,
      explain_topic: `Explain "${input?.topic || 'this topic'}" simply with examples. Level: ${input?.level || 'beginner'}.`,
      generate_quiz: `Generate ${input?.count || 5} quiz questions about "${input?.topic || 'this topic'}" with answers.`,
      generate_flashcards: `Create ${input?.count || 5} flashcards for "${input?.topic || 'this topic'}" with term and definition.`,
      recommend_tutorials: `Recommend a learning path for "${input?.subject || 'this subject'}". Goal: ${input?.goal || 'general'}.`,
      announcements_digest: `Summarize the latest announcements into key points and priorities.`,
      marketplace_insight: `Analyze marketplace listings. ${input?.query ? `Query: ${input.query}` : ''}${input?.category ? ` Category: ${input.category}` : ''}`,
      hostel_recommendation: `Recommend hostels. ${input?.budget ? `Budget: ₦${input.budget}` : ''}${input?.location ? ` Location: ${input.location}` : ''}`,
    };

    const prompt = toolPrompts[tool] || `Help with ${tool}: ${JSON.stringify(input)}`;

    const result = await processAiChat({
      prompt,
      profile: { ...profile, uid },
      attachment: null,
      history: [],
    });

    // Consume usage
    const updatedUsage = await consumeAiUsage(uid, isPremium);

    // Parse the response for structured data
    let summary = result.answer;
    let items = [];
    let recommendations = [];

    // Try to extract structured data from the response
    try {
      // Check if the response contains JSON
      const jsonMatch = result.answer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        summary = parsed.summary || parsed.answer || summary;
        items = parsed.items || [];
        recommendations = parsed.recommendations || [];
      }
    } catch {
      // Not JSON, use the text as-is
    }

    return res.status(200).json({
      success: true,
      summary,
      items,
      recommendations,
      toolResults: result.toolResults || [],
      usage: updatedUsage,
    });
  } catch (error) {
    console.error('[aiTools] Tool request failed:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'AI tool request failed.',
    });
  }
});

export default router;