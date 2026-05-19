/**
 * ExamTimer — countdown timer using Date.now() delta to avoid drift.
 */
const ExamTimer = (() => {
  let intervalId = null;
  let startEpoch = null;
  let initialSeconds = 0;
  let onTickCb = null;
  let onExpireCb = null;
  const WARNING_THRESHOLD = 5 * 60;   // 5 minutes
  const CRITICAL_THRESHOLD = 1 * 60;  // 1 minute

  function start(remainingSeconds, onTick, onExpire) {
    if (intervalId) stop();
    initialSeconds = remainingSeconds;
    startEpoch = Date.now();
    onTickCb = onTick;
    onExpireCb = onExpire;

    function tick() {
      const elapsed = Math.floor((Date.now() - startEpoch) / 1000);
      const remaining = Math.max(0, initialSeconds - elapsed);
      onTickCb(remaining);
      if (remaining === 0) {
        stop();
        onExpireCb();
      }
    }

    tick(); // immediate first tick
    intervalId = setInterval(tick, 1000);
  }

  function stop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function format(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  function getWarningLevel(seconds) {
    if (seconds <= CRITICAL_THRESHOLD) return 'critical';
    if (seconds <= WARNING_THRESHOLD)  return 'warning';
    return 'normal';
  }

  return { start, stop, format, getWarningLevel };
})();
