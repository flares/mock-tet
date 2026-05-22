/**
 * firebase-ai.js — Firebase AI (Gemini Developer API) integration.
 * Loaded as <script type="module"> so it can use ES import syntax.
 * Exposes window.AiExplainer for use by non-module scripts (questionbank.js).
 *
 * Prerequisites (one-time Firebase console setup):
 *   1. Copy js/firebase-config.example.js → js/firebase-config.js and fill in real values.
 *   2. In Firebase console → Build → AI → enable Gemini Developer API.
 */

import { initializeApp }                           from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-ai.js";

// ── Constants ───────────────────────────────────────────────────────────────

const SESSION_PREFIX = "ai_exp:";
const MODEL_NAME     = "gemini-2.0-flash";

const SUBJECT_LABELS = {
  cdp:         "Child Development & Pedagogy",
  telugu:      "Language",
  english:     "Language",
  mathematics:  "Maths",
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

// ── Core ────────────────────────────────────────────────────────────────────

let model = null;

function initModel() {
  if (model) return true;
  const config = window.FIREBASE_CONFIG;
  if (!config || config.apiKey === "YOUR_FIREBASE_API_KEY") return false;
  try {
    const app = initializeApp(config);
    const ai  = getAI(app, { backend: new GoogleAIBackend() });
    model = getGenerativeModel(ai, {
      model: MODEL_NAME,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: { temperature: 0.3 },
    });
    return true;
  } catch (err) {
    console.error("[firebase-ai] init failed:", err);
    return false;
  }
}

async function explain({ questionImage, optionImages = [], optionsInQuestion = false, correctAnswer, sectionId }) {
  // Check session cache first
  const cacheKey = sessionKey(questionImage);
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return cached;

  if (!initModel()) {
    throw new Error("Firebase AI not configured — copy js/firebase-config.example.js to js/firebase-config.js and fill in your project values.");
  }

  const letter      = correctLetter(correctAnswer);
  const subjectArea = SUBJECT_LABELS[(sectionId || "").toLowerCase()] || sectionId || "General";

  // Build image parts
  const imagesToFetch = [questionImage];
  if (!optionsInQuestion) {
    imagesToFetch.push(...optionImages.slice(0, 4));
  }
  const imageParts = await Promise.all(imagesToFetch.map(fetchImageAsInlineData));

  // Build content parts
  const parts = [];
  parts.push({ text: `Subject area: ${subjectArea}` });
  if (!optionsInQuestion) {
    parts.push({ text: "Question image:" });
    parts.push(imageParts[0]);
    parts.push({ text: "Option A:" }); parts.push(imageParts[1]);
    parts.push({ text: "Option B:" }); parts.push(imageParts[2]);
    parts.push({ text: "Option C:" }); parts.push(imageParts[3]);
    parts.push({ text: "Option D:" }); parts.push(imageParts[4]);
  } else {
    parts.push({ text: "Question image (options are printed inside the question image):" });
    parts.push(imageParts[0]);
  }

  if (letter) {
    parts.push({ text: `The verified correct answer from the official key is option ${letter}. Do not second-guess this.` });
  } else {
    parts.push({ text: "The correct answer is unknown — deduce it from the content if possible, mark it tentatively." });
  }

  parts.push({ text: `Generate the bilingual HTML explanation now. Remember: output ONLY the raw HTML fragment starting with <div and ending with </div>. data-subject="${subjectArea}".` });

  const result = await model.generateContent({ contents: [{ role: "user", parts }] });
  let html = result.response.text().trim();

  // Strip any accidental markdown code fence
  html = html.replace(/^```html?\s*/i, "").replace(/```\s*$/, "").trim();

  if (!html.startsWith("<")) {
    throw new Error("Unexpected response format from AI — did not return HTML.");
  }

  sessionStorage.setItem(cacheKey, html);
  return html;
}

// ── Public API on window ─────────────────────────────────────────────────────

window.AiExplainer = { explain, isConfigured: () => initModel() };
