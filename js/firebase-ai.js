/**
 * firebase-ai.js — Multi-provider AI explanation (Gemini, DeepSeek, any OpenAI-compatible).
 * Active provider is set via window.FIREBASE_CONFIG.aiModel.
 * Exposes window.AiExplainer for use by non-module scripts.
 *
 * Supported providers (set aiModel in firebase-config.js):
 *   "gemini"   — Google Gemini 2.5 Flash  (geminiApiKey)
 *   "deepseek" — DeepSeek v4 Flash        (deepseekApiKey)
 *
 * Adding a new OpenAI-compatible endpoint: add an entry to PROVIDERS below.
 */

// ── Provider registry ────────────────────────────────────────────────────────

const PROVIDERS = {
  gemini: {
    label:         "Gemini 2.5 Flash",
    modelName:     "gemini-2.5-flash",
    type:          "gemini",
    supportsVision: true,
    apiUrl:        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    getKey:        cfg => (cfg?.geminiApiKey && cfg.geminiApiKey !== "YOUR_GEMINI_API_KEY") ? cfg.geminiApiKey : null,
  },
  deepseek: {
    label:         "DeepSeek v4 Flash",
    modelName:     "deepseek-v4-flash",
    type:          "openai",
    supportsVision: false,
    apiUrl:        "https://api.deepseek.com/v1/chat/completions",
    getKey:        cfg => cfg?.deepseekApiKey || null,
  },
};

// ── Constants ────────────────────────────────────────────────────────────────

const SESSION_PREFIX = "ai_exp:";

const SUBJECT_LABELS = {
  cdp:         "Child Development & Pedagogy",
  telugu:      "Language",
  english:     "Language",
  mathematics: "Maths",
  science:     "Science",
};

const SYSTEM_INSTRUCTION = `
You are an expert tutor for the Telangana TET (Teacher Eligibility Test), fluent in both English and Telugu, with deep command of Child Development, Pedagogy, and Telugu, English, Maths and Science.
Purpose is a senior teacher who has been teaching only English for the last 20 years is now preparing for this test. So, please be as respectful as possible, but as helpful as possible to make them prepare for the upcoming test.

IMAGE FORMAT: You will receive a single composite image (a sprite). It is structured top-to-bottom as:
  1. The exam question (at the top)
  2. Option A (first option below the question)
  3. Option B
  4. Option C
  5. Option D (last, at the bottom)
Read the image top-to-bottom to identify the question and each option in order.

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

const MOBILE_ADDENDUM = `Give html output in a mobile-friendly manner. Note that the html you output will be displayed as-is without any processing, so curate your response accurately for mobile viewing following other principles mentioned below. Use compact layouts, avoid wide tables (prefer stacked rows or definition lists on mobile), keep font sizes readable (min 13px), use padding generously, avoid fixed widths, and prefer flex column layouts over multi-column grids.`;

// ── Provider helpers ─────────────────────────────────────────────────────────

function getActiveProvider() {
  const cfg  = window.FIREBASE_CONFIG;
  const name = cfg?.aiModel || "gemini";
  return PROVIDERS[name] || PROVIDERS.gemini;
}

function getApiKey() {
  return getActiveProvider().getKey(window.FIREBASE_CONFIG);
}

// ── Image fetch → neutral part ───────────────────────────────────────────────
// Neutral part: { type: "text", text } | { type: "image", dataUrl, mimeType }

async function fetchImagePart(url) {
  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new Error(`Image network error (${url}): ${e.message || e}`);
  }
  if (!resp.ok) throw new Error(`Image fetch failed (${resp.status}): ${url}`);
  const blob = await resp.blob();
  const mimeType = blob.type || "image/png";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve({ type: "image", dataUrl: reader.result, mimeType, originalUrl: url });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function txt(text) { return { type: "text", text }; }

// ── Provider-specific call functions ─────────────────────────────────────────

async function callGemini(provider, apiKey, neutralParts) {
  const geminiParts = neutralParts.map(p =>
    p.type === "image"
      ? { inlineData: { data: p.dataUrl.split(",")[1], mimeType: p.mimeType } }
      : { text: p.text }
  );
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: geminiParts }],
    generationConfig: { temperature: 0.3 },
  };
  let resp;
  try {
    resp = await fetch(`${provider.apiUrl}?key=${apiKey}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Gemini network error: ${e.message || e}. Check connectivity or try Wi-Fi.`);
  }
  if (!resp.ok) {
    const err = await resp.text().catch(() => String(resp.status));
    throw new Error(`Gemini API error [${resp.status}]: ${err}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini API.");
  return text;
}

async function callOpenAI(provider, apiKey, neutralParts) {
  const content = neutralParts.map(p =>
    p.type === "image"
      ? { type: "image_url", image_url: { url: p.originalUrl || p.dataUrl } }
      : { type: "text", text: p.text }
  );
  const body = {
    model:       provider.modelName,
    messages:    [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user",   content },
    ],
    temperature: 0.3,
  };
  let resp;
  try {
    resp = await fetch(provider.apiUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body:    JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`${provider.label} network error: ${e.message || e}. Check connectivity or try Wi-Fi.`);
  }
  if (!resp.ok) {
    const err = await resp.text().catch(() => String(resp.status));
    throw new Error(`${provider.label} API error [${resp.status}]: ${err}`);
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response from ${provider.label} API.`);
  return text;
}

async function callAI(neutralParts) {
  const provider   = getActiveProvider();
  const apiKey     = getApiKey();
  if (!apiKey) throw new Error(`${provider.label} API key missing — set ${provider.type === "openai" ? "deepseekApiKey" : "geminiApiKey"} in js/firebase-config.js`);
  const hasImages  = neutralParts.some(p => p.type === "image");
  if (hasImages && !provider.supportsVision) {
    throw new Error(`${provider.label} does not support image inputs. Set aiModel: "gemini" in firebase-config.js for in-app explanations (questions are images).`);
  }
  return provider.type === "openai"
    ? callOpenAI(provider, apiKey, neutralParts)
    : callGemini(provider, apiKey, neutralParts);
}

// ── Cache helpers ────────────────────────────────────────────────────────────

function sessionKey(questionImage) {
  const parts     = questionImage.split("/");
  const folder    = parts[parts.length - 2];
  const modelName = getActiveProvider().modelName;
  return `${SESSION_PREFIX}${modelName}:${folder}`;
}

// ── Core ─────────────────────────────────────────────────────────────────────

async function explain({ questionImage, optionImages = [], optionsInQuestion = false, spriteUrl = null, sprite = null, correctAnswer, sectionId, forceRegenerate = false, mobile = false }) {
  const cacheKey = sessionKey(questionImage);

  if (!forceRegenerate) {
    const lsPersisted = typeof ExplanationModal !== "undefined" && ExplanationModal.getAiCache(questionImage);
    if (lsPersisted) return lsPersisted;
    const ssCached = sessionStorage.getItem(cacheKey);
    if (ssCached) return ssCached;
  }

  const subjectArea = SUBJECT_LABELS[(sectionId || "").toLowerCase()] || sectionId || "General";
  const parts = [txt(`Subject area: ${subjectArea}`)];

  if (spriteUrl) {
    const spritePart = await fetchImagePart(spriteUrl);
    parts.push(
      txt("This is a sprite image containing the full question at the top followed by the 4 answer options (A, B, C, D) stacked vertically below it. Exact pixel boundaries for each section are provided after the image."),
      spritePart,
    );
    if (sprite && Object.keys(sprite).length) {
      const LABELS = { question: "Question", option1: "Option A", option2: "Option B", option3: "Option C", option4: "Option D" };
      const coordDesc = Object.entries(sprite)
        .map(([k, v]) => `${LABELS[k] || k}: y=${v.y}px to y=${v.y + v.h}px (height=${v.h}px, width=${v.w}px)`)
        .join("\n");
      parts.push(txt(`Sprite pixel boundaries (y=0 is top of image):\n${coordDesc}`));
    }
  } else {
    // Fallback: individual image files (desktop questionbank.html)
    const imagesToFetch = [questionImage, ...(!optionsInQuestion ? optionImages.slice(0, 4) : [])];
    const imageParts    = await Promise.all(imagesToFetch.map(fetchImagePart));
    if (!optionsInQuestion) {
      parts.push(txt("Question image:"), imageParts[0]);
      parts.push(txt("Option A:"),       imageParts[1]);
      parts.push(txt("Option B:"),       imageParts[2]);
      parts.push(txt("Option C:"),       imageParts[3]);
      parts.push(txt("Option D:"),       imageParts[4]);
    } else {
      parts.push(txt("Question image (options are inside):"), imageParts[0]);
    }
  }

  parts.push(txt(`Determine the correct option yourself and explain it. Generate the HTML now. data-subject="${subjectArea}".`));
  if (mobile) parts.push(txt(MOBILE_ADDENDUM));

  let html = await callAI(parts);
  html = html.replace(/^```html?\s*/i, "").replace(/```\s*$/, "").trim();
  if (!html.startsWith("<")) throw new Error("Unexpected response format from AI.");

  sessionStorage.setItem(cacheKey, html);
  if (typeof ExplanationModal !== "undefined") ExplanationModal.setAiCache(questionImage, html);
  return html;
}

window.AiExplainer = {
  explain,
  isConfigured:    () => !!getApiKey(),
  activeProvider:  () => getActiveProvider().label,
};
