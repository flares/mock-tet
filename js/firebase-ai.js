/**
 * firebase-ai.js — Gemini AI via @google/generative-ai + Firebase Analytics.
 * Loaded as <script type="module"> in questionbank.html.
 * Exposes window.AiExplainer for use by non-module scripts.
 *
 * Requires in js/firebase-config.js (gitignored):
 *   geminiApiKey  — from https://aistudio.google.com/apikey (free, no billing)
 *   measurementId — already in your Firebase config (for Analytics)
 */

import { GoogleGenerativeAI }        from "https://esm.run/@google/generative-ai";
import { initializeApp }              from "https://esm.run/firebase/app";
import { getAnalytics, logEvent }     from "https://esm.run/firebase/analytics";

// ── Constants ───────────────────────────────────────────────────────────────

const SESSION_PREFIX = "ai_exp:";
const MODEL_NAME     = "gemini-2.5-flash";

const SUBJECT_LABELS = {
  cdp:         "Child Development & Pedagogy",
  telugu:      "Language",
  english:     "Language",
  mathematics: "Maths",
  science:     "Science",
};

const SYSTEM_INSTRUCTION = `You are a TET (Teacher Eligibility Test, India) tutor. Generate a bilingual (English + Telugu) study explanation for a past-paper question.

OUTPUT RULE — CRITICAL: Return ONLY the raw HTML fragment. No markdown. No code fences. No explanatory text before or after. The response must start with the literal characters <div and end with </div>.

Use exactly these classes and section ids so existing CSS can style them. Add the literal class "correct" to the <li> matching the correct option only.

<div class="tet-explanation" data-subject="{SUBJECT_AREA}">
  <section class="question">
    <h3>Question / ప్రశ్న</h3>
    <p class="en">{English question text}</p>
    <p class="te">{Telugu question text}</p>
  </section>
  <section class="options">
    <ol type="A">
      <li class="option"><span class="en">{A English}</span><span class="te">{A Telugu}</span></li>
      <li class="option"><span class="en">{B English}</span><span class="te">{B Telugu}</span></li>
      <li class="option"><span class="en">{C English}</span><span class="te">{C Telugu}</span></li>
      <li class="option"><span class="en">{D English}</span><span class="te">{D Telugu}</span></li>
    </ol>
  </section>
  <section class="answer">
    <h3>Correct answer: {LETTER}</h3>
    <p class="en">{correct option English}</p>
    <p class="te">{correct option Telugu}</p>
  </section>
  <section class="short-explanation">
    <h3>Why this is right</h3>
    <p>{3–5 sentences in plain language}</p>
  </section>
  <section class="why-others-wrong">
    <h3>Why the others are wrong</h3>
    <p>{one short paragraph or one line per distractor}</p>
  </section>
  <section class="concept-notes">
    <h3>Concept notes</h3>
    <p>{150–200 words: underlying theory, key theorist, important terms, related distinctions. Bilingual — every term appears in English with a Telugu gloss.}</p>
  </section>
  <section class="corollary-questions">
    <h3>Likely spin-off TET questions</h3>
    <ol>
      <li>{spin-off Q1}</li>
      <li>{spin-off Q2}</li>
      <li>{spin-off Q3}</li>
    </ol>
  </section>
  <section class="memory-hook">
    <h3>Memory hook</h3>
    <p>{one crisp mnemonic or contrast sentence}</p>
  </section>
</div>`;

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

function correctLetter(correctAnswer) {
  const n = parseInt(correctAnswer, 10);
  return !isNaN(n) && n >= 1 && n <= 4 ? "ABCD"[n - 1] : null;
}

// ── Init ────────────────────────────────────────────────────────────────────

let model     = null;
let analytics = null;

function initServices() {
  if (model) return true;
  const config = window.FIREBASE_CONFIG;
  if (!config || !config.geminiApiKey || config.geminiApiKey === "YOUR_GEMINI_API_KEY") return false;
  try {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: { temperature: 0.3 },
    });
    if (config.measurementId) {
      const app = initializeApp(config);
      analytics = getAnalytics(app);
    }
    return true;
  } catch (err) {
    console.error("[firebase-ai] init failed:", err);
    return false;
  }
}

function track(eventName, params) {
  if (analytics) {
    try { logEvent(analytics, eventName, params); } catch (_) {}
  }
}

// ── Core ────────────────────────────────────────────────────────────────────

async function explain({ questionImage, optionImages = [], optionsInQuestion = false, correctAnswer, sectionId }) {
  const cacheKey = sessionKey(questionImage);
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    track("ai_explain_cache_hit", { subject: sectionId });
    return cached;
  }

  if (!initServices()) {
    throw new Error("Gemini API key missing — add geminiApiKey to js/firebase-config.js. Get a free key at https://aistudio.google.com/apikey");
  }

  const letter      = correctLetter(correctAnswer);
  const subjectArea = SUBJECT_LABELS[(sectionId || "").toLowerCase()] || sectionId || "General";

  track("ai_explain_requested", { subject: sectionId });

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
    text: letter
      ? `Verified correct answer: option ${letter}. Do not second-guess this. Generate the bilingual HTML explanation now. data-subject="${subjectArea}".`
      : `Correct answer unknown — deduce if possible. Generate the bilingual HTML now. data-subject="${subjectArea}".`,
  });

  const result = await model.generateContent({ contents: [{ role: "user", parts }] });
  let html = result.response.text().trim();
  html = html.replace(/^```html?\s*/i, "").replace(/```\s*$/, "").trim();

  if (!html.startsWith("<")) throw new Error("Unexpected response format from AI.");

  sessionStorage.setItem(cacheKey, html);
  track("ai_explain_success", { subject: sectionId });
  return html;
}

window.AiExplainer = { explain, isConfigured: () => initServices() };
