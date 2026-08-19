// ============================================================
// geminiService.js
// LLM layer — ONLY used for language understanding.
// All ranking/scoring/business logic stays in plain JS.
// ============================================================

const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-3.6-flash';   // fast + cheap for structured extraction


const BLOOD_GROUP_MAP = {
  'O_POSITIVE': 'O+',
  'O_NEGATIVE': 'O-',
  'A_POSITIVE': 'A+',
  'A_NEGATIVE': 'A-',
  'B_POSITIVE': 'B+',
  'B_NEGATIVE': 'B-',
  'AB_POSITIVE': 'AB+',
  'AB_NEGATIVE': 'AB-'
};
// ── Shared helper ─────────────────────────────────────────────────────────────
async function callGemini(systemInstruction, userText, responseSchema) {

  const cleanedUserText = userText
    .replace(/\b([a-zA-Z]{1,2})\s*\+/gi, '$1 positive ')
    .replace(/\b([a-zA-Z]{1,2})\s*\-/gi, '$1 negative ')
    .replace(/\s+/g, ' ')
    .trim();

  console.log(`[Gemini] Usertext :::::: "${cleanedUserText}"`);

  const result = await genai.models.generateContent({
    model: MODEL,
    contents: cleanedUserText,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema,
    }
  });

  // const raw = result.text;


  const rawText = typeof result.text === 'function'
    ? result.text()
    : (result.text || result.response?.text());



  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const cleanedJson = rawText.replace(/```json|```/gi, '').trim();
    parsed = JSON.parse(cleanedJson);
  }

  // 3. 🎯 MAP BACK TO DB FORMAT (e.g. O_POSITIVE -> O+)
  if (parsed.blood_group && BLOOD_GROUP_MAP[parsed.blood_group]) {
    parsed.blood_group = BLOOD_GROUP_MAP[parsed.blood_group];
  }

  console.log('[Gemini] Processed Result for DB:', parsed);
  return parsed;
}

// ── 1. parseRequest ───────────────────────────────────────────────────────────
/**
 * Parses a free-text emergency blood request (Urdu / Roman Urdu / English mix).
 *
 * Returns:
 * {
 *   blood_group:   string | null,   // canonical: "O+", "AB-", etc.
 *   count:         number | null,
 *   hospital:      string | null,
 *   urgency:       "low"|"normal"|"high"|"critical"|null,
 *   is_complete:   boolean,         // false if any critical field is missing
 *   follow_up_question: string | null  // empathetic question in user's language
 * }
 */
async function parseRequest(text) {
  console.log(`[Gemini] parseRequest called with: "${text}"`);

  const system = `
You are an emergency medical intake assistant for Al-Khidmat blood bank in Karachi.
Your ONLY job is to extract structured fields from a blood donation request.

CRITICAL RULES:
1. The text may be in English, Urdu (اردو), Roman Urdu, or a mix. Handle all.
2. Standardize blood groups strictly to one of these enum strings:
   - "O_POSITIVE", "O_NEGATIVE"
   - "A_POSITIVE", "A_NEGATIVE"
   - "B_POSITIVE", "B_NEGATIVE"
   - "AB_POSITIVE", "AB_NEGATIVE"
   Map all terms ("O+", "O positive", "O mosbat", "O pos", "او پازیٹو") -> "O_POSITIVE".
3. Urgency mapping:
   - "jaldi", "urgent", "فوری", "abhi chahiye", "emergency" -> "critical"
   - "aaj chahiye", "today", "soon" -> "high"
   - No urgency mentioned -> "normal"
4. Field completeness:
   - Required fields: blood_group, hospital.
   - If ANY required field is missing -> set is_complete = false and write a single warm follow-up question in the SAME language/script used by user.
5. "count" defaults to 1 if unspecified.
6. NEVER invent data. If absent, set field to null.
`;

  const schema = {
    type: 'object',
    properties: {
      blood_group: { type: 'string', nullable: true },
      count: { type: 'number', nullable: true },
      hospital: { type: 'string', nullable: true },
      urgency: { type: 'string', enum: ['low', 'normal', 'high', 'critical'], nullable: true },
      is_complete: { type: 'boolean' },
      follow_up_question: { type: 'string', nullable: true },
    },
    required: ['is_complete'],
  };

  const parsed = await callGemini(system, text, schema);
  console.log('[Gemini] parseRequest result:', JSON.stringify(parsed));
  return parsed;
}

// ── 2. parseDonorIntent ───────────────────────────────────────────────────────
/**
 * Classifies a donor's free-text reply.
 *
 * Returns:
 * {
 *   intent: "confirm" | "decline" | "reschedule" | "eligibility_update" | "unclear",
 *   reschedule_time: string | null,   // e.g. "kal subah 9 baje" if intent=reschedule
 *   note: string                       // brief reason/detail for logging
 * }
 */
async function parseDonorIntent(text) {
  console.log(`[Gemini] parseDonorIntent called with: "${text}"`);

  const system = `
You are classifying a Pakistani blood donor's WhatsApp reply to a donation request.
The donor may reply in English, Urdu, or Roman Urdu (or a mix).

INTENT DEFINITIONS — pick the SINGLE best fit:

• "confirm"           — Donor agrees to donate now.
  Examples: "haan", "ji", "theek hai", "yes", "I'll come", "آ رہا ہوں", "ok done"

• "decline"           — Donor cannot or will not donate.
  Examples: "nahi", "sorry busy hoon", "no", "nahi aa sakta", "not possible"

• "reschedule"        — Donor can donate but not right now — gives a future time.
  Examples: "kal aa sakta hoon", "I can come tomorrow morning", "shaam ko aata hoon"
  → Extract the time/day into reschedule_time field.

• "eligibility_update" — Donor reveals they recently donated blood (within 90 days),
  making them INELIGIBLE. Do NOT treat this as a decline.
  Examples: "I gave blood last month", "maine pichle hafte khoon diya tha",
            "abhi 3 hafte pehle donate kiya", "recently donated"

• "unclear"           — Reply is ambiguous, a question, or unrelated.
  Examples: "which hospital?", "konsa blood group?", "hello", "??", random text
  → For questions about the request, set note to "donor is asking: [their question]"
    so the calling code can send back the request details.

RULES:
- A donor saying "I can come tomorrow" is "reschedule", NOT "decline".
- A donor saying "last month I donated" is ALWAYS "eligibility_update".
- When intent is "reschedule", always extract reschedule_time even if vague ("kal").
- Keep "note" short — one sentence max.
`;

  const schema = {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['confirm', 'decline', 'reschedule', 'eligibility_update', 'unclear'],
      },
      reschedule_time: { type: 'string', nullable: true },
      note: { type: 'string' },
    },
    required: ['intent', 'note'],
  };

  const parsed = await callGemini(system, text, schema);
  console.log('[Gemini] parseDonorIntent result:', JSON.stringify(parsed));
  return parsed;
}

module.exports = { parseRequest, parseDonorIntent };
