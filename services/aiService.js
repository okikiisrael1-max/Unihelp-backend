import axios from 'axios';
import { db } from '../firebase/firebaseAdmin.js';

/* =========================================================
   Gemini Configuration
========================================================= */

const MAX_PROMPT_LENGTH = 6000;
const DEFAULT_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'];

function resolveModels() {
  const configuredModels = String(process.env.GEMINI_MODEL || process.env.GEMINI_MODELS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return configuredModels.length ? configuredModels : DEFAULT_MODELS;
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
}

/* =========================================================
   Firestore Data Helpers
========================================================= */

async function fetchNotes(limit = 5) {
  try {
    const snapshot = await db.collection('notes').orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch {
    return [];
  }
}

async function fetchAnnouncements(limit = 5) {
  try {
    const snapshot = await db.collection('announcements').orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, title: doc.data().title, body: doc.data().body || doc.data().description }));
  } catch {
    return [];
  }
}

async function fetchMarketplaceListings(limit = 5) {
  try {
    const snapshot = await db.collection('marketplace_listings').orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch {
    return [];
  }
}

async function fetchHostels(limit = 5) {
  try {
    const snapshot = await db.collection('hostels').orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch {
    return [];
  }
}

/* =========================================================
   Gemini Function Declarations (Tool Definitions)
========================================================= */

const TOOL_DEFINITIONS = [
  {
    name: 'summarize_notes',
    description: 'Summarize the user\'s lecture notes into key points. Returns a concise summary of available notes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'string', description: 'Optional specific topic to summarize. If empty, summarizes all recent notes.' },
      },
    },
  },
  {
    name: 'explain_topic',
    description: 'Explain a given academic topic simply with examples and applications.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'string', description: 'The topic to explain.' },
        level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: 'Explanation depth.' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'generate_quiz',
    description: 'Generate quiz questions on a topic to help the user test their knowledge.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'string', description: 'The topic for the quiz.' },
        count: { type: 'number', description: 'Number of questions (default 5).' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'generate_flashcards',
    description: 'Create flashcards for a topic to aid memorization.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'string', description: 'The topic for flashcards.' },
        count: { type: 'number', description: 'Number of flashcards (default 5).' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'recommend_tutorials',
    description: 'Recommend tutorial content or learning paths based on a subject or topic.',
    parameters: {
      type: 'OBJECT',
      properties: {
        subject: { type: 'string', description: 'The subject or topic to get recommendations for.' },
        goal: { type: 'string', description: 'The user\'s learning goal (e.g. exam prep, beginners).' },
      },
      required: ['subject'],
    },
  },
  {
    name: 'announcements_digest',
    description: 'Get a digest or summary of the latest announcements from the app.',
    parameters: {
      type: 'OBJECT',
      properties: {
        count: { type: 'number', description: 'Number of recent announcements to include (default 5).' },
      },
    },
  },
  {
    name: 'marketplace_insight',
    description: 'Get insights, price comparisons, or recommendations about marketplace listings.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'string', description: 'What the user wants to know about marketplace items.' },
        category: { type: 'string', description: 'Optional category filter.' },
      },
    },
  },
  {
    name: 'hostel_recommendation',
    description: 'Get hostel recommendations based on budget, location, and preferences.',
    parameters: {
      type: 'OBJECT',
      properties: {
        budget: { type: 'number', description: 'Maximum budget.' },
        location: { type: 'string', description: 'Preferred location or area.' },
      },
    },
  },
];

/* =========================================================
   Tool Handlers (actual data fetching)
========================================================= */

async function handleToolCall(functionCall) {
  const { name, args } = functionCall;
  const input = args || {};

  switch (name) {
    case 'summarize_notes': {
      const notes = await fetchNotes(5);
      const topic = input.topic || '';
      const filtered = topic
        ? notes.filter((n) => (n.title || '').toLowerCase().includes(topic.toLowerCase()) || (n.content || '').toLowerCase().includes(topic.toLowerCase()))
        : notes;
      return {
        success: true,
        tool: name,
        data: {
          notes: filtered,
          totalNotes: filtered.length,
          topic: topic || 'all recent notes',
        },
      };
    }

    case 'explain_topic': {
      return {
        success: true,
        tool: name,
        data: {
          topic: input.topic,
          level: input.level || 'beginner',
        },
      };
    }

    case 'generate_quiz': {
      return {
        success: true,
        tool: name,
        data: {
          topic: input.topic,
          count: input.count || 5,
        },
      };
    }

    case 'generate_flashcards': {
      return {
        success: true,
        tool: name,
        data: {
          topic: input.topic,
          count: input.count || 5,
        },
      };
    }

    case 'recommend_tutorials': {
      return {
        success: true,
        tool: name,
        data: {
          subject: input.subject,
          goal: input.goal || 'general',
        },
      };
    }

    case 'announcements_digest': {
      const announcements = await fetchAnnouncements(input.count || 5);
      return {
        success: true,
        tool: name,
        data: {
          announcements,
          total: announcements.length,
        },
      };
    }

    case 'marketplace_insight': {
      const listings = await fetchMarketplaceListings(10);
      return {
        success: true,
        tool: name,
        data: {
          listings,
          total: listings.length,
          query: input.query || '',
          category: input.category || '',
        },
      };
    }

    case 'hostel_recommendation': {
      const hostels = await fetchHostels(10);
      const filtered = hostels.filter((h) => {
        if (input.budget && (h.price || h.rent) > input.budget) return false;
        if (input.location && !(h.location || h.area || '').toLowerCase().includes(input.location.toLowerCase())) return false;
        return true;
      });
      return {
        success: true,
        tool: name,
        data: {
          hostels: filtered,
          total: filtered.length,
          budget: input.budget || null,
          location: input.location || '',
        },
      };
    }

    default:
      return {
        success: false,
        tool: name,
        error: `Unknown tool: ${name}`,
      };
  }
}

/* =========================================================
   Gemini API Call
========================================================= */

async function callGemini(prompt, profile, attachment = {}, history = []) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured on the server.');
  }

  const models = resolveModels();
  const systemInstruction = `You are Unihelp AI, the central intelligent assistant for a Nigerian student app. You help with study, recommendations, and app features.

Key capabilities:
- You can use tools to fetch real data from the app's database (notes, announcements, marketplace, hostels).
- Explain topics simply with Nigerian curriculum context.
- Generate quizzes and flashcards.
- Summarize notes and announcements.
- Recommend tutorials and study paths.

Rules:
- Never mention database internals or Firestore.
- Never say "as an AI" or "I don't have access to real data" - you DO have access via tools.
- Be concise and practical.
- For Nigerian students, reference WAEC, JAMB, and university context.
- Premium users get longer, more detailed responses.`;

  const contents = [];

  // Add history if provided
  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      });
    }
  }

  // Build the user prompt
  const userContext = `Student: ${profile.username || profile.displayName || 'Student'}
Role: ${profile.role || 'student'}
Premium: ${profile.premium ? 'yes' : 'no'}`;

  let attachmentText = '';
  if (attachment?.name) {
    attachmentText = `\n[Attachment: ${attachment.name} (${attachment.mimeType || 'unknown'})]`;
    if (attachment.url) {
      attachmentText += `\nFile URL: ${attachment.url}`;
    }
  }

  const fullPrompt = `${systemInstruction}\n\n${userContext}\n\nStudent request:\n${prompt}${attachmentText}`;

  contents.push({
    role: 'user',
    parts: [{ text: fullPrompt }],
  });

  // Add image if present
  if (attachment?.mimeType?.startsWith('image/') && attachment?.base64) {
    contents[contents.length - 1].parts.push({
      inlineData: {
        mimeType: attachment.mimeType,
        data: attachment.base64,
      },
    });
  }

  const payload = {
    contents,
    tools: [{ functionDeclarations: TOOL_DEFINITIONS }],
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: profile?.premium ? 2000 : 1000,
    },
  };

  let lastError;

  for (const version of ['v1', 'v1beta']) {
    for (const modelName of models) {
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/${version}/models/${modelName}:generateContent?key=${apiKey}`,
          payload,
          { timeout: 45000 }
        );

        return response.data;
      } catch (error) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message || '';

        if (status === 400 && /API key not valid|API_KEY_INVALID|invalid API key|INVALID_ARGUMENT/i.test(message)) {
          throw error;
        }

        lastError = error;
      }
    }
  }

  throw lastError || new Error('All Gemini models failed.');
}

/* =========================================================
   Process Gemini Response (handle function calls)
========================================================= */

async function processGeminiResponse(responseData) {
  const candidate = responseData?.candidates?.[0];
  if (!candidate) return null;

  const parts = candidate.content?.parts || [];
  let textResponse = '';
  let toolCalls = [];

  for (const part of parts) {
    if (part.text) {
      textResponse += part.text;
    }
    if (part.functionCall) {
      toolCalls.push(part.functionCall);
    }
  }

  // If Gemini wants to call tools, execute them and send results back
  if (toolCalls.length > 0) {
    const toolResults = [];

    for (const functionCall of toolCalls) {
      const result = await handleToolCall(functionCall);
      toolResults.push({
        functionResponse: {
          name: functionCall.name,
          response: result,
        },
      });
    }

    return {
      text: textResponse.trim(),
      toolCalls,
      toolResults,
      hasToolCalls: true,
    };
  }

  return {
    text: textResponse.trim(),
    toolCalls: [],
    toolResults: [],
    hasToolCalls: false,
  };
}

/* =========================================================
   Main Chat Function
========================================================= */

export async function processAiChat({ prompt, profile = {}, attachment = null, history = [] }) {
  if (!prompt?.trim()) {
    throw new Error('Prompt is required');
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt is too long. Keep it under ${MAX_PROMPT_LENGTH} characters.`);
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    // Return a helpful response instead of erroring
    return {
      answer: `I'm not fully configured yet. The server needs a **GEMINI_API_KEY** environment variable. Once that's set, I can help with:

- 📝 Summarizing notes
- 💡 Explaining topics
- 📋 Generating quizzes
- 🃏 Making flashcards
- 📚 Recommending tutorials
- 📢 Summarizing announcements
- 🛒 Marketplace insights
- 🏠 Hostel recommendations

Try setting up the API key and asking again!`,
      usage: null,
    };
  }

  try {
    const responseData = await callGemini(prompt, profile, attachment, history);
    const processed = await processGeminiResponse(responseData);

    // If there were tool calls, send the results back to Gemini for final response
    if (processed.hasToolCalls) {
      const updatedContents = responseData.candidates?.[0]?.content ? [responseData.candidates[0].content] : [];
      const userContext = `Student: ${profile.username || profile.displayName || 'Student'}`;
      const nextPayload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${userContext}\n\n${prompt}` }],
          },
          ...updatedContents,
          {
            role: 'function',
            parts: processed.toolResults,
          },
        ],
        tools: [{ functionDeclarations: TOOL_DEFINITIONS }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: profile?.premium ? 2000 : 1000,
        },
      };

      const models = resolveModels();
      let lastError;

      for (const version of ['v1', 'v1beta']) {
        for (const modelName of models) {
          try {
            const finalResponse = await axios.post(
              `https://generativelanguage.googleapis.com/${version}/models/${modelName}:generateContent?key=${apiKey}`,
              nextPayload,
              { timeout: 45000 }
            );

            const finalCandidate = finalResponse.data?.candidates?.[0];
            const finalText = finalCandidate?.content?.parts
              ?.map((p) => p.text)
              .filter(Boolean)
              .join('\n')
              .trim() || '';

            return {
              answer: finalText || processed.text,
              toolResults: processed.toolResults,
              usage: null,
            };
          } catch (error) {
            lastError = error;
          }
        }
      }

      // If the final response fails, return the tool data formatted
      const toolSummary = processed.toolResults
        .map((tr) => {
          const data = tr.functionResponse?.response?.data;
          return data ? JSON.stringify(data, null, 2) : '';
        })
        .filter(Boolean)
        .join('\n\n');

      return {
        answer: processed.text || `Here's what I found:\n\n${toolSummary || 'No additional data available.'}`,
        toolResults: processed.toolResults,
        usage: null,
      };
    }

    return {
      answer: processed.text || buildFallbackAnswer(prompt, profile),
      toolResults: processed.toolResults,
      usage: null,
    };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message || 'AI request failed.';
    const friendlyError =
      /API key not valid|API_KEY_INVALID|invalid API key/i.test(message)
        ? 'The Gemini API key configured on the server is invalid. Please update GEMINI_API_KEY.'
        : message;

    console.error('[aiService] Chat failed:', friendlyError);
    return {
      answer: buildFallbackAnswer(prompt, profile),
      toolResults: [],
      usage: null,
    };
  }
}

/* =========================================================
   Simple Study Query (non-tool, for quick questions)
========================================================= */

export async function processStudyQuery({ prompt, profile = {}, attachment = null }) {
  if (!prompt?.trim()) {
    throw new Error('Prompt is required');
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { answer: 'AI service is not configured on the server.' };
  }

  const models = resolveModels();
  const studyPrompt = `You are Unihelp AI, a concise academic assistant for Nigerian students.
Give practical study help, clear explanations, examples, and revision steps.
Do not invent facts. If a question needs current school-specific information, say what to verify.

Student context:
- Name: ${profile.username || profile.displayName || 'Student'}
- Role: ${profile.role || 'student'}
- Premium: ${profile.premium ? 'yes' : 'no'}

Student request:
${prompt}${attachment?.name ? `\n[Attachment: ${attachment.name}]` : ''}`;

  const parts = [{ text: studyPrompt }];
  if (attachment?.mimeType?.startsWith('image/') && attachment?.base64) {
    parts.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.base64 } });
  }

  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: profile?.premium ? 1400 : 700,
    },
  };

  let lastError;

  for (const version of ['v1', 'v1beta']) {
    for (const modelName of models) {
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/${version}/models/${modelName}:generateContent?key=${apiKey}`,
          payload,
          { timeout: 30000 }
        );

        const answer = response.data?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text)
          .filter(Boolean)
          .join('\n')
          .trim() || '';

        return { answer: answer || buildFallbackAnswer(prompt, profile) };
      } catch (error) {
        const status = error.response?.status;
        const msg = error.response?.data?.error?.message || error.message || '';

        if (status === 400 && /API key not valid|API_KEY_INVALID|invalid API key|INVALID_ARGUMENT/i.test(msg)) {
          throw error;
        }
        lastError = error;
      }
    }
  }

  throw lastError || new Error('AI request failed.');
}

/* =========================================================
   Fallback
========================================================= */

function buildFallbackAnswer(prompt, profile = {}) {
  const topic = String(prompt || '').trim().slice(0, 120) || 'your study topic';
  const premiumHint = profile?.premium
    ? 'You are using the premium experience, so I can be more detailed in practice.'
    : 'Upgrade to premium for longer and more detailed explanations.';

  return `I can help with **${topic}**.

Try this approach:
1. Break the topic into the main concepts.
2. Write one short example for each concept.
3. Test yourself with 3 quick questions.
4. Review the weak areas and repeat the process.

${premiumHint}`;
}