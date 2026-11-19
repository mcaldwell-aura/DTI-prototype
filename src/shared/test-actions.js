(() => {
  const session = window.DTIRouteSession;
  const scope = session.roadTestStorageKey.slice('dtiRoadTest:'.length);
  const statusKey = 'dtiTestStatus:' + scope;
  const maxLength = 2000;
  const actions = {
    cancel: {
      title: 'Cancel test?', label: 'Please describe why the test is being canceled.', confirm: 'Cancel test',
      record: (screen, reason) => ({ status: 'Canceled', cancelScreen: screen, cancelReason: reason, canceledAt: Date.now() }),
      // A canceled test is over, so its working data is cleared.
      clearWorkingData: true, home: '02-start-a-test.html?canceled=examiner',
      failure: 'An error occurred while canceling the test, please try again.'
    },
    pause: {
      title: 'Pause test?', label: 'Please describe why the test is being paused.', confirm: 'Pause test',
      record: (screen, reason) => ({ status: 'Paused', pauseScreen: screen, pausedReason: reason, pausedAt: Date.now() }),
      // A paused test is resumed later, so its working data is kept.
      clearWorkingData: false, home: '02-start-a-test.html?paused=examiner',
      failure: 'An error occurred while pausing the test, please try again.'
    }
  };
  let screen = '';
  let saveFields = () => ({});

  function configure(options) {
    screen = options.screen;
    if (options.saveFields) saveFields = options.saveFields;
  }

  // Returns an error message, or null after saving the test status and navigating home.
  function submit(type, comments) {
    const action = actions[type];
    const reason = String(comments || '').trim().slice(0, maxLength);
    if (!reason) return 'Description required.';
    try {
      window.sessionStorage.setItem(statusKey, JSON.stringify({ ...action.record(screen, reason), savedFields: saveFields() || {} }));
      if (action.clearWorkingData) {
        ['dtiPreTestChecks:' + scope, session.roadTestStorageKey, 'dtiCurrentTestAcknowledgement'].forEach((key) => window.sessionStorage.removeItem(key));
        session.clear();
      }
    } catch (error) {
      return action.failure;
    }
    window.location.assign(action.home);
    return null;
  }

  window.DTITestActions = {
    configure, statusKey, maxLength,
    cancelTest: (comments) => submit('cancel', comments),
    pauseTest: (comments) => submit('pause', comments)
  };
  if (typeof document === 'undefined') return;

  let overlay = null;
  let previousFocus = null;
  const fitScale = () => Math.max(0, Math.min((window.innerWidth - 32) / 1280, (window.innerHeight - 32) / 800));
  const scaleDialog = () => {
    if (overlay) overlay.querySelector('.test-action-dialog').style.transform = 'scale(' + fitScale() + ')';
  };

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }

  function open(type) {
    const action = actions[type];
    if (overlay || !action) return;
    previousFocus = document.activeElement;
    overlay = document.createElement('div');
    overlay.className = 'test-action-overlay';
    overlay.innerHTML =
      '<section class="test-action-dialog" role="dialog" aria-modal="true" aria-labelledby="test-action-title">' +
        '<h2 id="test-action-title"></h2>' +
        '<label for="test-action-comments"><span class="test-action-label"></span> <span class="test-action-required">*</span></label>' +
        '<textarea id="test-action-comments" maxlength="' + maxLength + '" required aria-required="true" aria-describedby="test-action-count"></textarea>' +
        '<div class="test-action-meta"><p class="test-action-error" id="test-action-error" role="alert" hidden></p><span class="test-action-count" id="test-action-count">0 / ' + maxLength + '</span></div>' +
        '<div class="test-action-buttons">' +
          '<button type="button" class="test-action-back">Back</button>' +
          '<button type="button" class="test-action-confirm"></button>' +
        '</div>' +
      '</section>';
    overlay.querySelector('h2').textContent = action.title;
    overlay.querySelector('.test-action-label').textContent = action.label;
    overlay.querySelector('.test-action-confirm').textContent = action.confirm;
    document.body.appendChild(overlay);
    scaleDialog();
    const comments = overlay.querySelector('textarea');
    const error = overlay.querySelector('.test-action-error');
    const showError = (message) => {
      error.textContent = message || '';
      error.hidden = !message;
      if (message) comments.setAttribute('aria-invalid', 'true');
      else comments.removeAttribute('aria-invalid');
    };
    comments.addEventListener('input', () => {
      overlay.querySelector('.test-action-count').textContent = comments.value.length + ' / ' + maxLength;
      if (comments.value.trim()) showError('');
    });
    overlay.querySelector('.test-action-back').addEventListener('click', close);
    overlay.querySelector('.test-action-confirm').addEventListener('click', () => {
      const message = submit(type, comments.value);
      showError(message);
      if (message) comments.focus();
    });
    comments.focus();
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest && event.target.closest('[data-test-action]');
    if (trigger) {
      event.preventDefault();
      open(trigger.getAttribute('data-test-action'));
    }
  });
  document.addEventListener('keydown', (event) => {
    if (!overlay) return;
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const controls = Array.from(overlay.querySelectorAll('textarea, button'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!overlay.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  });
  window.addEventListener('resize', scaleDialog);
  Object.assign(window.DTITestActions, { open, close });
})();
