(() => {
  const params = new URLSearchParams(window.location.search);
  // Opening the files directly or from a local dev server counts as "running locally", which is not connected.
  const runningLocally = () => window.location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const connected = () => navigator.onLine && !runningLocally();
  window.DTIConnection = { connected };

  const first = (params.get('firstName') || '').trim();
  const middle = (params.get('middleName') || '').trim();
  const last = (params.get('lastName') || '').trim();
  // Demo customer when a screen is opened directly without lookup data.
  const name = first || last ? [first, middle ? middle.charAt(0).toUpperCase() + '.' : '', last].filter(Boolean).join(' ') : 'Jordan A. Reyes';
  const testType = params.get('testType') || 'nc';
  const testTypeLabel = { nc: 'Non-commercial road test', commercial: 'Commercial road test' }[testType] || testType;
  const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const signalIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="15" width="3.5" height="6" rx="1"></rect><rect x="8.5" y="11" width="3.5" height="10" rx="1"></rect><rect x="14" y="7" width="3.5" height="14" rx="1"></rect><rect x="19.5" y="3" width="3.5" height="18" rx="1"></rect></svg>';

  function render() {
    const online = connected();
    const key = name + '|' + testTypeLabel + '|' + online;
    const html =
      '<div class="test-context-customer"><div class="test-context-name">' + escape(name) + '</div><div class="test-context-type">' + escape(testTypeLabel) + '</div></div>' +
      '<div class="test-context-connection ' + (online ? 'is-connected' : 'is-offline') + '" role="status">' +
        '<div class="test-context-status">' + signalIcon + (online ? 'Connected' : 'Not connected') + '</div>' +
        (online ? '' : '<div class="test-context-warning">Tablet not connected. Test data will save locally until connection is established.</div>') +
      '</div>';
    document.querySelectorAll('[data-test-context]').forEach((el) => {
      if (el.dataset.rendered === key && el.firstChild) return;
      el.dataset.rendered = key;
      el.innerHTML = html;
    });
  }

  function init() {
    // Some screens render their markup after load, so fill the header whenever it appears.
    new MutationObserver(render).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('online', render);
    window.addEventListener('offline', render);
    render();
  }
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
