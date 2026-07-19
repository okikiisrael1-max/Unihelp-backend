import express from 'express';
import { db } from '../firebase/firebaseAdmin.js';
import { authenticateFirebaseUser } from '../middleware/auth.js';

const router = express.Router();

const createPrompt = ({ tool, input, profile = {} }) => `
You are Unihelp AI, the central study assistant for a student app.
You must never mention database internals or claim to access Firestore directly.
You can help with study, recommendations, and app-specific guidance.

User profile:
- Name: ${profile.username || profile.displayName || 'Student'}
- Role: ${profile.role || 'student'}
- Premium: ${profile.premium ? 'yes' : 'no'}

Tool: ${tool}
Input: ${JSON.stringify(input || {}, null, 2)}

Return a concise, practical response in JSON with fields:
{
  "summary": "...",
  "items": [],
  "recommendations": []
}
`;

const buildToolResponse = (tool, input, profile = {}) => {
  const fallback = {
    summary: `I can help with ${tool} for ${profile.username || 'you'} right away.`,
    items: [],
    recommendations: [],
  };

  switch (tool) {
    case 'summarize_notes':
      return {
        ...fallback,
        summary: `Here is a quick summary for the selected notes: ${input?.title || 'your notes'}.`,
        items: [{ title: 'Key idea', description: 'Focus on the main concept, supporting evidence, and the ending takeaway.' }],
      };
    case 'explain_topic':
      return {
        ...fallback,
        summary: `A simple explanation for ${input?.topic || 'this topic'}: break it into definition, example, and application.`,
      };
    case 'generate_quiz':
      return {
        ...fallback,
        summary: 'Here is a short quiz structure you can use to test your understanding.',
        items: [
          { title: 'Question 1', description: 'What is the main idea behind this topic?' },
          { title: 'Question 2', description: 'How would you apply it in practice?' },
        ],
      };
    case 'generate_flashcards':
      return {
        ...fallback,
        summary: 'Create flashcards around the core terms and definitions.',
        items: [{ title: 'Term', description: 'Definition' }],
      };
    case 'recommend_tutorials':
      return {
        ...fallback,
        summary: 'I recommend a short tutorial sequence tailored to your current topic.',
        recommendations: [{ title: 'Start with the basics', description: 'Build confidence before moving to advanced practice.' }],
      };
    case 'marketplace_insight':
      return {
        ...fallback,
        summary: 'I can help compare marketplace listings by price, condition, and urgency.',
        recommendations: [{ title: 'Compare options', description: 'Check pricing, condition, and delivery details.' }],
      };
    case 'hostel_recommendation':
      return {
        ...fallback,
        summary: 'I can help shortlist hostel options based on budget, safety, and commute.',
        recommendations: [{ title: 'Shortlist hostels', description: 'Match the best options to your budget and campus needs.' }],
      };
    case 'announcements_digest':
      return {
        ...fallback,
        summary: 'I can summarize the latest announcements into priorities and deadlines.',
      };
    default:
      return fallback;
  }
};

router.post('/tool', authenticateFirebaseUser, async (req, res) => {
  try {
    const { tool, input = {}, profile = {} } = req.body || {};
    if (!tool) {
      return res.status(400).json({ success: false, error: 'Tool is required' });
    }

    const response = buildToolResponse(tool, input, profile);
    return res.status(200).json({ success: true, ...response });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'AI tool request failed' });
  }
});

export default router;
