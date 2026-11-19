(() => {
  const session = window.DTIRouteSession;
  // Placeholder for the story's "[X MPH]" threshold; replace once the value is decided.
  const thresholdMph = 5;
  const simulatedSpeedMph = 8;

  function roadTestStarted() {
    try {
      const record = JSON.parse(window.sessionStorage.getItem(session.roadTestStorageKey) || 'null');
      return !!(record && record.startedAt);
    } catch (error) {
      return false;
    }
  }

  // The alert only applies before the road test timer starts; each pre-exam screen loads this script.
  const shouldAlert = (speedMph) => speedMph > thresholdMph && !roadTestStarted();

  window.DTIMotionAlert = { thresholdMph, shouldAlert };
  if (typeof document === 'undefined') return;

  let overlay = null;
  let previousFocus = null;
  const fitScale = () => Math.max(0, Math.min((window.innerWidth - 32) / 1280, (window.innerHeight - 32) / 800));
  const scaleDialog = () => {
    if (overlay) overlay.querySelector('.motion-alert-dialog').style.transform = 'scale(' + fitScale() + ')';
  };

  function playAlert() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const audio = new AudioContext();
    // A soft rising two-note chime (C5 then G5); sine tones with a quick fade-in and gentle decay.
    const notes = [[523.25, 0], [783.99, 0.18]];
    notes.forEach(([frequency, start]) => {
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      const at = audio.currentTime + start;
      tone.type = 'sine';
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, at);
      volume.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
      tone.connect(volume).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 0.72);
    });
    setTimeout(() => audio.close(), 1200);
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }

  function show() {
    if (overlay) return;
    previousFocus = document.activeElement;
    overlay = document.createElement('div');
    overlay.className = 'motion-alert-overlay';
    // Critical layout is inline so the alert stays visible even if a cached stylesheet lacks its rules.
    overlay.style.cssText = 'position: fixed; z-index: 200; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(20,24,29,0.55);';
    overlay.innerHTML =
      '<section class="motion-alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="motion-alert-title" aria-describedby="motion-alert-message" style="width: 560px; box-sizing: border-box; padding: 28px 32px 24px; border: 3px solid #B42318; border-radius: 14px; background: #FFFFFF;">' +
        '<div class="motion-alert-heading">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 22 21H2Z"></path><path d="M12 10v4M12 17h.01"></path></svg>' +
          '<h2 id="motion-alert-title">Vehicle motion detected</h2>' +
        '</div>' +
        '<p id="motion-alert-message">It seems like the driver has started moving. Instruct them to stop until the test officially begins.</p>' +
        '<div class="motion-alert-actions"><button type="button" class="motion-alert-ok">OK</button></div>' +
      '</section>';
    document.body.appendChild(overlay);
    scaleDialog();
    overlay.querySelector('.motion-alert-ok').addEventListener('click', close);
    overlay.querySelector('.motion-alert-ok').focus();
    playAlert();
  }

  function reportSpeed(speedMph) {
    if (shouldAlert(speedMph)) show();
  }

  function init() {
    const demo = document.createElement('button');
    demo.type = 'button';
    demo.className = 'motion-alert-demo';
    demo.style.position = 'fixed';
    demo.style.zIndex = '150';
    demo.textContent = 'Demo: simulate vehicle motion (' + simulatedSpeedMph + ' mph)';
    // For demos, the pill always simulates motion before the road test timer starts, so it skips the Start Time check.
    demo.addEventListener('click', show);
    document.body.appendChild(demo);
    // Keep the pill in the empty middle of the scaled 1280×800 screen's header.
    const place = () => {
      const root = document.querySelector('body > #dc-root, body > x-dc, #screen-root');
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const scale = rect.width / 1280;
      demo.style.top = rect.top + 16 * scale + 'px';
      demo.style.left = rect.left + 640 * scale + 'px';
      demo.style.transform = 'translateX(-50%) scale(' + scale + ')';
    };
    new MutationObserver((records) => {
      if (!records.every((record) => record.target === demo)) place();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', place);
    place();
  }

  // The examiner must acknowledge with OK, so Escape does not close it; Tab stays on OK.
  document.addEventListener('keydown', (event) => {
    if (overlay && event.key === 'Tab') {
      event.preventDefault();
      overlay.querySelector('.motion-alert-ok').focus();
    }
  });
  window.addEventListener('resize', scaleDialog);
  Object.assign(window.DTIMotionAlert, { reportSpeed, show, close });
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
