/**
 * ExamState — singleton module managing the entire exam session.
 *
 * State is persisted to sessionStorage on every mutation so a page refresh
 * inside the exam restores the session. Final results are written to localStorage.
 */
const ExamState = (() => {
  const STORAGE_KEY = 'tet_exam_session';
  const RESULT_PREFIX = 'tet_result_';

  let examData = null;   // frozen after load
  let pendingAnswer = null;  // option key selected but not yet saved

  let session = {
    examId: null,
    startTime: null,
    remainingSeconds: 0,
    currentGlobalIndex: 0,
    activeSectionId: null,
    answers: {},   // { "0": "B", "12": "A" } — saved answers only
    statuses: {},  // { "0": "answered", "3": "not-answered" } — omit "not-visited"
    submitted: false,
  };

  // ── Internal helpers ──────────────────────────────────────────────────────

  function persist() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function sectionForIndex(idx) {
    return examData.sections.find(s =>
      idx >= s.startIndex && idx < s.startIndex + s.questionCount
    ) || null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async function load(examId) {
    // Restore existing session if exam IDs match
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (saved.examId === examId && !saved.submitted) {
          session = saved;
          // Fetch exam data
          const resp = await fetch(`exams/${examId}.json`);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          examData = await resp.json();
          pendingAnswer = null;
          return;
        }
      } catch (_) { /* fall through to fresh session */ }
    }

    // Fresh session
    const resp = await fetch(`exams/${examId}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    examData = await resp.json();

    session = {
      examId,
      startTime: Date.now(),
      remainingSeconds: examData.duration * 60,
      currentGlobalIndex: 0,
      activeSectionId: examData.sections[0].id,
      answers: {},
      statuses: {},
      submitted: false,
    };
    pendingAnswer = null;
    persist();
  }

  function getExamData() { return examData; }

  function getQuestion(globalIndex) {
    return examData.questions[globalIndex] || null;
  }

  function getCurrentQuestion() {
    return getQuestion(session.currentGlobalIndex);
  }

  // Effective status of a question (derives "not-visited" when absent from map)
  function getStatus(idx) {
    const key = String(idx);
    return session.statuses[key] || 'not-visited';
  }

  function getPendingAnswer() { return pendingAnswer; }

  function getSavedAnswer(idx) {
    return session.answers[String(idx)] || null;
  }

  // Select an option on the current question (not yet persisted to answers)
  function selectOption(key) {
    pendingAnswer = key;
  }

  // Navigate to a question; auto-transition "not-visited" → "not-answered"
  function navigateTo(newIdx) {
    if (newIdx < 0 || newIdx >= examData.questions.length) return false;

    // Mark current as "not-answered" if it was never visited before
    const curKey = String(session.currentGlobalIndex);
    if (!session.statuses[curKey]) {
      session.statuses[curKey] = 'not-answered';
    }

    session.currentGlobalIndex = newIdx;
    session.activeSectionId = sectionForIndex(newIdx)?.id || null;
    pendingAnswer = getSavedAnswer(newIdx);  // pre-populate pending from saved
    persist();
    return true;
  }

  // Save pending answer and advance
  function saveAndNext() {
    const idx = session.currentGlobalIndex;
    const key = String(idx);

    if (pendingAnswer) {
      session.answers[key] = pendingAnswer;
      // Check if was previously marked → keep "answered-marked", else "answered"
      const prev = session.statuses[key];
      session.statuses[key] = (prev === 'marked' || prev === 'answered-marked')
        ? 'answered-marked'
        : 'answered';
    } else {
      session.statuses[key] = 'not-answered';
    }

    const next = idx + 1;
    if (next < examData.questions.length) {
      navigateTo(next);
    } else {
      persist();
    }
    return next;
  }

  // Mark for review and advance
  function markAndNext() {
    const idx = session.currentGlobalIndex;
    const key = String(idx);

    if (pendingAnswer) {
      session.answers[key] = pendingAnswer;
      session.statuses[key] = 'answered-marked';
    } else {
      session.statuses[key] = 'marked';
    }

    const next = idx + 1;
    if (next < examData.questions.length) {
      navigateTo(next);
    } else {
      persist();
    }
    return next;
  }

  // Clear the response for the current question
  function clearResponse() {
    const idx = session.currentGlobalIndex;
    const key = String(idx);
    delete session.answers[key];
    // If was answered-marked → downgrade to marked
    if (session.statuses[key] === 'answered-marked') {
      session.statuses[key] = 'marked';
    } else {
      session.statuses[key] = 'not-answered';
    }
    pendingAnswer = null;
    persist();
  }

  // Update remaining time (called by timer every second)
  function tickTimer(remaining) {
    session.remainingSeconds = remaining;
    // Lightweight persist — only update remaining seconds
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  // Return counts for the submit dialog
  function getSummary() {
    const total = examData.questions.length;
    let answered = 0, notAnswered = 0, marked = 0, answeredMarked = 0, notVisited = 0;
    for (let i = 0; i < total; i++) {
      const s = getStatus(i);
      if (s === 'answered') answered++;
      else if (s === 'not-answered') notAnswered++;
      else if (s === 'marked') marked++;
      else if (s === 'answered-marked') answeredMarked++;
      else notVisited++;
    }
    return { total, answered, notAnswered, marked, answeredMarked, notVisited };
  }

  // Calculate score (only call after exam is submitted)
  function calculateScore() {
    const total = examData.questions.length;
    let correct = 0, incorrect = 0, attempted = 0;
    const details = [];
    for (let i = 0; i < total; i++) {
      const q = examData.questions[i];
      const savedAnswer = session.answers[String(i)] || null;
      let result = 'skipped';
      if (savedAnswer) {
        attempted++;
        if (savedAnswer === q.correctAnswer) { correct++; result = 'correct'; }
        else { incorrect++; result = 'incorrect'; }
      }
      details.push({ globalIndex: i, question: q, userAnswer: savedAnswer, result });
    }
    return { correct, incorrect, attempted, unattempted: total - attempted, total, details };
  }

  // Persist final state to localStorage for the result page
  function finalSubmit() {
    session.submitted = true;
    session.submittedAt = Date.now();
    const score = calculateScore();
    const resultKey = `${RESULT_PREFIX}${session.examId}`;
    localStorage.setItem(resultKey, JSON.stringify({ session, score, examData }));
    sessionStorage.removeItem(STORAGE_KEY);
  }

  // Load result from localStorage (used by result.html)
  function loadResult(examId) {
    const raw = localStorage.getItem(`${RESULT_PREFIX}${examId}`);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function getSession() { return session; }

  return {
    load, getExamData, getQuestion, getCurrentQuestion,
    getStatus, getPendingAnswer, getSavedAnswer,
    selectOption, navigateTo, saveAndNext, markAndNext, clearResponse,
    tickTimer, getSummary, calculateScore, finalSubmit, loadResult,
    getSession,
  };
})();
