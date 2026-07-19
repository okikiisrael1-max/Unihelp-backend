import express from "express";
import axios from "axios";

const router = express.Router();

const MAX_PROMPT_LENGTH = 6000;
const DEFAULT_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro"];

const resolveModels = () => {
  const configuredModels = String(process.env.GEMINI_MODEL || process.env.GEMINI_MODELS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configuredModels.length ? configuredModels : DEFAULT_MODELS;
};

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

const callGemini = async (geminiApiKey, prompt, profile) => {
  const models = resolveModels();
  const payload = {
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
  };

  let lastError;

  for (const version of ["v1", "v1beta"]) {
    for (const modelName of models) {
      try {
        return await axios.post(
          `https://generativelanguage.googleapis.com/${version}/models/${modelName}:generateContent?key=${geminiApiKey}`,
          payload,
          { timeout: 30000 }
        );
      } catch (error) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message || "";

        if (status === 400 && /API key not valid|API_KEY_INVALID|invalid API key|INVALID_ARGUMENT/i.test(message)) {
          throw error;
        }

        lastError = error;
      }
    }
  }

  throw lastError || new Error("AI request failed.");
};

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

    const response = await callGemini(geminiApiKey, prompt, profile);

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

    const message = error.response?.data?.error?.message || error.message || "AI request failed. Please try again.";
    const friendlyError =
      /API key not valid|API_KEY_INVALID|invalid API key/i.test(message)
        ? "The Gemini API key configured on the server is invalid or inactive. Please update GEMINI_API_KEY."
        : message;

    return res.status(500).json({
      success: false,
      error: friendlyError,
    });
  }
});

export default router;
