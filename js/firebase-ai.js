/**
 * firebase-ai.js — Gemini AI via direct REST API (no SDK, no CDN imports).
 * Exposes window.AiExplainer for use by non-module scripts.
 *
 * Requires in js/firebase-config.js (gitignored):
 *   geminiApiKey  — from https://aistudio.google.com/apikey (free, no billing)
 */

// ── Constants ───────────────────────────────────────────────────────────────

const SESSION_PREFIX = "ai_exp:";
const MODEL_NAME     = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

const SUBJECT_LABELS = {
  cdp:         "Child Development & Pedagogy",
  telugu:      "Language",
  english:     "Language",
  mathematics: "Maths",
  science:     "Science",
};

const SYSTEM_INSTRUCTION = `
You are an expert tutor for the Telangana TET (Teacher Eligibility Test), fluent in both English and Telugu, with deep command of Child Development, Pedagogy, and Telugu, English , Maths  and Science.
Purpose is a senior teacher who has been teaching only English for the last 20 years is now preparing for this test. So, please be as respectful as possible, but as helpful as possible to make them prepare for the upcoming test.

OUTPUT RULE — CRITICAL: Return ONLY the raw HTML fragment. No markdown. No code fences. No explanatory text before or after. The response must start with the literal characters <div> and end with </div>.
Output your response in clean Markdown HTML. Do not wrap symbols in LaTeX delimiters like $ or $$. Use standard Unicode characters for symbols (e.g., use 'ε' instead of standard math blocks)
The question and options are bilingual, but respond only in one language and use words of other language if reuqired, but dont duplicate your output in both languages.

Give a 1) clear short explanation and 2) a detailed long explanation for helping with the preparation. Add 3) possible related questions, 4) memory hooks if required.
For #1) Try not to make this a paragraph by being crisp and explanatory of why this option better suits or how you can eliminate other options.
For #2) Long explanation - ensure you have visually better html rather than long paragraphs. Prefer showing stuff visually over words where possible or required.
For #3) possible related quesions, also give answers and strucutre them with better html styling.
For #4) memory hooks, use better visual html styling rather than simple raw paragraphs

Ensure you are using the correct HTML formatting and inline styling for visually clean view. Your output will be copied as is into the explanation section, so ensure you have all styling in place.

<div class="tet-explanation" data-subject="{SUBJECT_AREA}">
  <section class="answer">
    <h3>Correct answer: {NUMBER}</h3>
    <p class="en">{correct option English}</p>
  </section>
  {HERE add all your other section as appropriate - }
</div>
`;

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchImageAsInlineData(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Image fetch failed: ${url}`);
  const blob = await resp.blob();
  const mimeType = blob.type || "image/png";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve({ inlineData: { data: reader.result.split(",")[1], mimeType } });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sessionKey(questionImage) {
  const parts = questionImage.split("/");
  return SESSION_PREFIX + parts[parts.length - 2];
}

// ── Init ────────────────────────────────────────────────────────────────────

function getApiKey() {
  const config = window.FIREBASE_CONFIG;
  if (!config || !config.geminiApiKey || config.geminiApiKey === "YOUR_GEMINI_API_KEY") return null;
  return config.geminiApiKey;
}

// ── Gemini REST call ─────────────────────────────────────────────────────────

async function callGemini(apiKey, parts) {
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.3 },
  };

  const resp = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => String(resp.status));
    throw new Error(`[GoogleGenerativeAI Error]: Error fetching from ${GEMINI_API_URL}: [${resp.status} ] ${errText}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini API.");
  return text;
}

// ── Core ────────────────────────────────────────────────────────────────────

const MOBILE_ADDENDUM = `Give html output in a mobile-friendly manner. Note that the html you output will be displayed as-is without any processing, so curate your response accurately for mobile viewing following other principles mentioned below. Use compact layouts, avoid wide tables (prefer stacked rows or definition lists on mobile), keep font sizes readable (min 13px), use padding generously, avoid fixed widths, and prefer flex column layouts over multi-column grids.`;

async function explain({ questionImage, optionImages = [], optionsInQuestion = false, correctAnswer, sectionId, forceRegenerate = false, mobile = false }) {
  const cacheKey = sessionKey(questionImage);

  // Check localStorage first (persists across sessions), then sessionStorage
  if (!forceRegenerate) {
    const lsPersisted = typeof ExplanationModal !== "undefined" && ExplanationModal.getAiCache(questionImage);
    if (lsPersisted) return lsPersisted;
    const ssCached = sessionStorage.getItem(cacheKey);
    if (ssCached) return ssCached;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Gemini API key missing — add geminiApiKey to js/firebase-config.js. Get a free key at https://aistudio.google.com/apikey");
  }

  const subjectArea = SUBJECT_LABELS[(sectionId || "").toLowerCase()] || sectionId || "General";

  const imagesToFetch = [questionImage, ...(!optionsInQuestion ? optionImages.slice(0, 4) : [])];
  const imageParts    = await Promise.all(imagesToFetch.map(fetchImageAsInlineData));

  const parts = [{ text: `Subject area: ${subjectArea}` }];
  if (!optionsInQuestion) {
    parts.push({ text: "Question image:" },      imageParts[0]);
    parts.push({ text: "Option A:" },             imageParts[1]);
    parts.push({ text: "Option B:" },             imageParts[2]);
    parts.push({ text: "Option C:" },             imageParts[3]);
    parts.push({ text: "Option D:" },             imageParts[4]);
  } else {
    parts.push({ text: "Question image (options are inside):" }, imageParts[0]);
  }
  parts.push({
    text: `Determine the correct option yourself and explain it. Generate the HTML now. data-subject="${subjectArea}".`,
  });

  if (mobile) parts.push({ text: MOBILE_ADDENDUM });

  let html = await callGemini(apiKey, parts);
  html = html.replace(/^```html?\s*/i, "").replace(/```\s*$/, "").trim();

  if (!html.startsWith("<")) throw new Error("Unexpected response format from AI.");

  // Persist to both caches
  sessionStorage.setItem(cacheKey, html);
  if (typeof ExplanationModal !== "undefined") ExplanationModal.setAiCache(questionImage, html);
  return html;
}

window.AiExplainer = { explain, isConfigured: () => !!getApiKey() };
