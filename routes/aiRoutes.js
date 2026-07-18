import express from "express";
import axios from "axios";

const router = express.Router();

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
const MAX_PROMPT_LENGTH = 6000;

const buildStudyPrompt = (prompt, profile = {}) => `
You are Unihelp AI, a concise academic assistant for Nigerian students.
Give practical study help, clear explanations, examples, and revision steps.
Do not invent facts. If a question needs current school-specific information, say what to verify.

Student context:
- Name: ${profile.username || profile.displayName || "Student"}
- Role: ${profile.role || "student"}
- Premium: ${profile.premium ? "yes" : "no"}

Student request:
${prompt}
`;

router.post("/study", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    const profile = req.body?.profile || {};

    if (!prompt) {
      return res.status(400).json({ success: false, error: "Prompt is required" });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Prompt is too long. Keep it under ${MAX_PROMPT_LENGTH} characters.`,
      });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!geminiApiKey) {
      return res.status(503).json({
        success: false,
        error: "AI service is not configured. Set GEMINI_API_KEY on the backend.",
      });
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: buildStudyPrompt(prompt, profile) }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: profile?.premium ? 1400 : 700,
        },
      },
      { timeout: 30000 }
    );

    const answer =
      response.data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter(Boolean)
        .join("\n")
        .trim() || "";

    if (!answer) {
      return res.status(502).json({ success: false, error: "AI returned an empty response" });
    }

    return res.status(200).json({ success: true, answer });
  } catch (error) {
    console.error("AI study request failed:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || "AI request failed. Please try again.",
    });
  }
});

export default router;
