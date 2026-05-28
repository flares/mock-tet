/**
 * r2-explanations.js — client-side wrapper for the tet-qb-worker R2 API.
 *
 * Requires in window.FIREBASE_CONFIG:
 *   workerUrl        — https://tet-qb-worker.<account>.workers.dev
 *   workerAuthToken  — the secret set via `wrangler secret put AUTH_TOKEN`
 *
 * Exposes window.R2Explanations:
 *   isConfigured()                           → bool
 *   fetch(questionImage)                     → Promise<doc|null>
 *   save(questionImage, html, model?)        → Promise<explanation|null>
 *   rate(questionImage, expId, action)       → Promise<explanation|null>
 *   remove(questionImage, expId)             → Promise<bool>
 *   bestExplanation(explanations)            → explanation|null
 *   getUserVote(questionImage, expId)        → 'liked'|'disliked'|null
 *   setUserVote(questionImage, expId, vote)  → void
 */
(function () {
  const R2_CACHE_PFX    = 'r2_exp:';
  const VOTE_PFX        = 'r2_vote:';
  const INDEX_CACHE_KEY = 'r2_exp_index';
  // Worker URL is not a secret — hardcoded so fetchIndex() works even without firebase-config.js
  const WORKER_URL_DEFAULT = 'https://tet-qb-worker.y-manojkrishna.workers.dev';

  // In-memory set of questionIds known to be in the R2 index (populated by fetchIndex).
  let _indexSet = null;

  // Warm _indexSet from localStorage synchronously so hasInIndex works before
  // fetchIndex() resolves on cold start.
  try {
    const cached = JSON.parse(localStorage.getItem(INDEX_CACHE_KEY) || 'null');
    if (Array.isArray(cached)) _indexSet = new Set(cached);
  } catch {}

  // ── Path helpers ────────────────────────────────────────────────────────────

  function parseImage(questionImage) {
    // "question_bank/CDP/2026-Jan-03-Shift1_Q001_8657994132/question.png"
    const parts = questionImage.split('/');
    return { subject: parts[1], folder: parts[2] };
  }

  function folderKey(questionImage) {
    return parseImage(questionImage).folder;
  }

  function apiUrl(questionImage, expId) {
    const cfg  = getConfig();
    const base = cfg.workerUrl.replace(/\/+$/, '');
    const { subject, folder } = parseImage(questionImage);
    return expId
      ? `${base}/explanations/${subject}/${folder}/${expId}`
      : `${base}/explanations/${subject}/${folder}`;
  }

  function authHeader() {
    const token = window.FIREBASE_CONFIG?.workerAuthToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function getConfig() {
    return window.FIREBASE_CONFIG?.workerUrl ? window.FIREBASE_CONFIG : null;
  }

  // ── localStorage cache for R2 docs ─────────────────────────────────────────

  function getCached(questionImage) {
    try { return JSON.parse(localStorage.getItem(R2_CACHE_PFX + folderKey(questionImage))); } catch { return null; }
  }

  function setCached(questionImage, doc) {
    try { localStorage.setItem(R2_CACHE_PFX + folderKey(questionImage), JSON.stringify(doc)); } catch {}
  }

  // ── User vote tracking ──────────────────────────────────────────────────────

  function getUserVote(questionImage, expId) {
    try {
      const stored = JSON.parse(localStorage.getItem(VOTE_PFX + folderKey(questionImage)));
      return stored?.expId === expId ? (stored.vote || null) : null;
    } catch { return null; }
  }

  function setUserVote(questionImage, expId, vote) {
    try { localStorage.setItem(VOTE_PFX + folderKey(questionImage), JSON.stringify({ expId, vote })); } catch {}
  }

  // ── Pick best explanation ──────────────────────────────────────────────────
  // Highest net score (likes − dislikes), then most recent.

  function bestExplanation(explanations) {
    if (!explanations?.length) return null;
    return [...explanations].sort((a, b) => {
      const sa = (a.likes || 0) - (a.dislikes || 0);
      const sb = (b.likes || 0) - (b.dislikes || 0);
      if (sb !== sa) return sb - sa;
      return new Date(b.generatedAt) - new Date(a.generatedAt);
    })[0];
  }

  function workerBase() {
    return (window.FIREBASE_CONFIG?.workerUrl || WORKER_URL_DEFAULT).replace(/\/+$/, '');
  }

  function indexUrl() {
    return `${workerBase()}/index`;
  }

  // ── R2 index — which questionIds have at least one explanation ─────────────

  async function fetchIndex() {
    try {
      const resp = await fetch(indexUrl());
      if (!resp.ok) throw new Error('non-ok');
      const doc = await resp.json();
      const ids = doc.questionIds || [];
      _indexSet = new Set(ids);
      try { localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(ids)); } catch {}
      return { questionIds: ids, count: ids.length };
    } catch {
      try {
        const cached = JSON.parse(localStorage.getItem(INDEX_CACHE_KEY) || '[]');
        _indexSet = new Set(cached);
        return { questionIds: cached, count: cached.length };
      } catch {
        _indexSet = new Set();
        return { questionIds: [], count: 0 };
      }
    }
  }

  async function addToIndex(questionImage) {
    if (!getConfig()) return null;
    const qId = folderKey(questionImage);
    if (_indexSet?.has(qId)) return _indexSet.size;
    try {
      const resp = await fetch(indexUrl(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body:    JSON.stringify({ questionId: qId }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!_indexSet) _indexSet = new Set();
      _indexSet.add(qId);
      try { localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify([..._indexSet])); } catch {}
      return data.count;
    } catch { return null; }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async function fetch_(questionImage) {
    const cached = getCached(questionImage);
    if (cached) return cached;

    if (!getConfig()) return null;
    try {
      const resp = await fetch(apiUrl(questionImage));
      if (!resp.ok) return null;
      const doc = await resp.json();
      if (doc.explanations?.length) setCached(questionImage, doc);
      return doc;
    } catch { return null; }
  }

  async function save(questionImage, html, model = 'gemini-2.5-flash') {
    if (!getConfig()) return null;
    try {
      const resp = await fetch(apiUrl(questionImage), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body:    JSON.stringify({ html, model }),
      });
      if (!resp.ok) return null;
      const exp = await resp.json();
      // Merge into local cache
      const cached = getCached(questionImage) || { schemaVersion: '1.0', explanations: [] };
      cached.explanations.push(exp);
      setCached(questionImage, cached);
      return exp;
    } catch { return null; }
  }

  async function rate(questionImage, expId, action) {
    if (!getConfig()) return null;
    try {
      const resp = await fetch(apiUrl(questionImage, expId), {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body:    JSON.stringify({ action }),
      });
      if (!resp.ok) return null;
      const updated = await resp.json();
      // Patch local cache
      const cached = getCached(questionImage);
      if (cached) {
        const i = cached.explanations.findIndex(e => e.id === expId);
        if (i >= 0) cached.explanations[i] = { ...cached.explanations[i], ...updated };
        setCached(questionImage, cached);
      }
      return updated;
    } catch { return null; }
  }

  async function remove(questionImage, expId) {
    if (!getConfig()) return false;
    try {
      const resp = await fetch(apiUrl(questionImage, expId), {
        method:  'DELETE',
        headers: authHeader(),
      });
      if (!resp.ok) return false;
      const cached = getCached(questionImage);
      if (cached) {
        cached.explanations = cached.explanations.filter(e => e.id !== expId);
        setCached(questionImage, cached);
      }
      return true;
    } catch { return false; }
  }

  window.R2Explanations = { isConfigured: () => !!getConfig(), fetch: fetch_, save, rate, remove, bestExplanation, getUserVote, setUserVote, fetchIndex, addToIndex, hasInIndex: q => !!_indexSet?.has(folderKey(q)) };
})();
