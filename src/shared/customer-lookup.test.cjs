const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function harness(search = '') {
  const navigations = [];
  class Logic {
    constructor() { this.state = {}; }
    setState(patch) { this.state = { ...this.state, ...patch }; }
  }
  const storage = new Map();
  const window = {
    location: { search, assign: (url) => navigations.push(url) },
    sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  };
  const context = vm.createContext({ window, URLSearchParams, Date, DCLogic: Logic });
  vm.runInContext(readFileSync(join(__dirname, 'customer-lookup.js'), 'utf8'), context);
  const html = readFileSync(join(__dirname, '..', '03-start-walk-in-test.html'), 'utf8');
  const code = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  const Component = vm.runInContext('(function () {' + code + '; return Component; })()', context);
  return { component: new Component(), lookup: window.DTICustomerLookup, navigations, storage };
}
const change = (component, action, value) => component.renderVals()[action]({ currentTarget: { value } });
const type = (component, action, value) => {
  const target = { value };
  component.renderVals()[action]({ currentTarget: target });
  return target.value;
};
function fill(component) {
  change(component, 'changeType', 'nc');
  change(component, 'updateDl', 'D12345678');
  change(component, 'updateDob', '03/14/2007');
}

test('eligible lookup navigates directly to verification with the matched customer and test context', () => {
  const h = harness('?testId=demo-test&siteId=east-demo&appointmentDate=2026-11-16&cameraConnected=false');
  const c = h.component;
  assert.equal(c.renderVals().searchDisabled, true);
  c.renderVals().searchMax();
  assert.equal(h.navigations.length, 0);
  fill(c);
  assert.equal(c.renderVals().searchDisabled, false);
  change(c, 'updateDl', ' d87654321 ');
  c.renderVals().searchMax();
  assert.equal(h.navigations.length, 1);
  const next = new URL(h.navigations[0], 'http://localhost');
  assert.equal(next.pathname, '/04-verify-customer.html');
  assert.equal(next.searchParams.get('customerId'), 'DTI-C-20482');
  assert.equal(next.searchParams.get('middleName'), 'Morgan');
  assert.equal(next.searchParams.get('dlId'), 'D87654321');
  assert.equal(next.searchParams.get('testType'), 'nc');
  assert.equal(next.searchParams.get('testId'), 'demo-test');
  assert.equal(next.searchParams.get('siteId'), 'east-demo');
  assert.equal(next.searchParams.get('appointmentDate'), '2026-11-16');
  assert.equal(next.searchParams.get('cameraConnected'), 'false');
});

test('SSN lookup finds one customer but never puts the search SSN into the customer response or navigation URL', () => {
  const h = harness();
  fill(h.component);
  h.component.renderVals().useSsn();
  change(h.component, 'updateSsn', '90000123');
  assert.equal(h.component.renderVals().searchDisabled, true);
  change(h.component, 'updateSsn', '900001234');
  h.component.renderVals().searchMax();
  assert.equal(h.navigations.length, 1);
  assert.equal(h.navigations[0].includes('900001234'), false);
  assert.equal(h.navigations[0].toLowerCase().includes('ssn'), false);
  const result = h.lookup.search({ method: 'ssn', identifier: '900001234', dob: '03/14/2007', testType: 'nc', scenario: 'eligible' });
  assert.equal(result.customer.customerId, 'DTI-C-20481');
  assert.equal('demoSsn' in result.customer, false);
});

test('no match and connection errors stay on lookup, are distinct, and can be corrected and retried', () => {
  const h = harness();
  const c = h.component;
  fill(c);
  change(c, 'updateDl', 'D00000000');
  c.renderVals().searchMax();
  assert.equal(c.renderVals().showNoRecord, true);
  assert.equal(c.renderVals().showConnectionError, false);
  assert.equal(h.navigations.length, 0);
  change(c, 'updateDl', 'D12345678');
  assert.equal(c.renderVals().showNoRecord, false);
  change(c, 'updateDob', '03/15/2007');
  c.renderVals().searchMax();
  assert.equal(c.renderVals().showNoRecord, true);
  change(c, 'updateDob', '03/14/2007');
  change(c, 'changeScenario', 'connection-error');
  c.renderVals().searchMax();
  assert.equal(c.renderVals().showConnectionError, true);
  assert.equal(c.renderVals().showNoRecord, false);
  assert.equal(h.navigations.length, 0);
  c.renderVals().dismissConnectionError();
  assert.equal(c.renderVals().showConnectionError, false);
  change(c, 'changeScenario', 'no-record');
  c.renderVals().searchMax();
  assert.equal(c.renderVals().showNoRecord, true);
  change(c, 'changeScenario', 'eligible');
  c.renderVals().searchMax();
  assert.equal(h.navigations.length, 1);
});

test('New, In Progress, or failed-today tests disable Search with a message until the lookup changes', () => {
  for (const scenario of ['new', 'in-progress', 'failed-today']) {
    const h = harness();
    const c = h.component;
    fill(c);
    change(c, 'changeScenario', scenario);
    c.renderVals().searchMax();
    const view = c.renderVals();
    assert.equal(h.navigations.length, 0, scenario);
    assert.equal(view.searchDisabled, true, scenario);
    assert.equal(view.showSearch, true, scenario);
    assert.equal(view.eligibilityMessages.length, 1);
    assert.equal(view.eligibilityMessages[0].text, scenario === 'failed-today'
      ? 'Customer has completed this test today and cannot retake.'
      : 'A Non-commercial road test already exists for this customer.');
    change(c, 'updateDob', '03/14/2007');
    assert.equal(c.renderVals().eligibilityMessages.length, 0);
    assert.equal(c.renderVals().searchDisabled, false);
    change(c, 'changeScenario', 'failed-earlier');
    c.renderVals().searchMax();
    let retake = c.renderVals();
    assert.equal(h.navigations.length, 0, 'A previous-day failure shows the retake note first');
    assert.equal(retake.showSearch, false);
    assert.match(retake.retakeMessage, /^This customer failed a Non-commercial road test on \d{2}\/\d{2}\/\d{4}\.$/);
    retake.continueRetake();
    assert.equal(h.navigations.length, 1, 'A previous-day failure does not block a retake');
  }
});

test('a Paused test replaces Search with Resume test, which saves In Progress with a resumed timestamp and opens verification', () => {
  const h = harness('?testId=new-demo-test');
  const c = h.component;
  fill(c);
  change(c, 'changeScenario', 'paused');
  c.renderVals().searchMax();
  let view = c.renderVals();
  assert.equal(h.navigations.length, 0);
  assert.equal(view.showSearch, false);
  assert.equal(view.showResume, true);
  assert.match(view.pausedMessage, /^Paused test found, started \d{2}\/\d{2}\/\d{4} at 9:12 AM\.$/);
  change(c, 'updateDob', '03/14/2007');
  assert.equal(c.renderVals().showSearch, true, 'Changing the lookup returns to Search');
  c.renderVals().searchMax();
  c.renderVals().resumeTest();
  const saved = JSON.parse(h.storage.get('dtiTestInstance:DTI-0987'));
  assert.equal(saved.status, 'In Progress');
  assert.match(saved.resumedTimestamp, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} (AM|PM)$/);
  const next = new URL(h.navigations[0], 'http://localhost');
  assert.equal(next.pathname, '/04-verify-customer.html');
  assert.equal(next.searchParams.get('testId'), 'DTI-0987');
  assert.equal(next.searchParams.get('customerId'), 'DTI-C-20481');
});

test('lookup fields require a 9-character DL ID, add DOB slashes, and mask SSN digits with dashes', () => {
  const h = harness();
  const c = h.component;
  change(c, 'changeType', 'nc');
  assert.equal(type(c, 'updateDob', '03'), '03/');
  assert.equal(type(c, 'updateDob', '03/1'), '03/1');
  assert.equal(type(c, 'updateDob', '03/14'), '03/14/');
  assert.equal(type(c, 'updateDob', '03/14'), '03/14');
  assert.equal(type(c, 'updateDob', '03/1'), '03/1');
  assert.equal(type(c, 'updateDob', '0314200799'), '03/14/2007');
  assert.equal(type(c, 'updateDl', 'd1234-5678x'), 'D12345678');
  assert.equal(c.renderVals().searchDisabled, false);
  type(c, 'updateDl', 'D1234567');
  assert.equal(c.renderVals().searchDisabled, true);
  c.renderVals().useSsn();
  let shown = '';
  for (const digit of '900001234') shown = type(c, 'updateSsn', shown + digit);
  assert.equal(shown, '***-**-****');
  assert.equal(c.renderVals().ssnDisplay, '***-**-****');
  assert.equal(c.state.ssnValue, '900001234');
  assert.equal(c.renderVals().searchDisabled, false);
  shown = type(c, 'updateSsn', '***-**-***');
  assert.equal(c.state.ssnValue, '90000123');
  assert.equal(type(c, 'updateSsn', shown + '4'), '***-**-****');
  c.renderVals().searchMax();
  assert.equal(h.navigations.length, 1);
});

test('eligibility matches customer and test type, uses the local completed date, ignores site, and reports both blockers', () => {
  const { lookup } = harness();
  const today = new Date(2026, 10, 16, 0, 1);
  const base = { customerId: 'demo-customer', testType: 'nc', siteId: 'another-site' };
  for (const status of ['New', 'In Progress']) {
    assert.equal(lookup.blockers(base.customerId, 'nc', [{ ...base, status }], today).length, 1);
  }
  assert.equal(lookup.blockers(base.customerId, 'nc', [{ ...base, status: 'Paused' }], today).length, 0);
  const tests = [
    { ...base, status: 'In Progress' },
    { ...base, status: 'Fail', completedDate: '2026-11-16' }
  ];
  assert.equal(lookup.blockers(base.customerId, 'nc', tests, today).length, 2);
  const nonBlocking = [
    { ...base, customerId: 'another-customer', status: 'New' },
    { ...base, testType: 'other-test', status: 'In Progress' },
    { ...base, status: 'Pass', completedDate: '2026-11-16' },
    { ...base, status: 'Fail', completedDate: '2026-11-15' },
    { ...base, status: 'Fail', completedDate: '2026-11-17' }
  ];
  assert.equal(lookup.blockers(base.customerId, 'nc', nonBlocking, today).length, 0);
  assert.equal(lookup.blockers(base.customerId, 'nc', [{ ...base, status: 'Fail', completedDate: '2026-11-16' }], new Date(2026, 10, 16, 23, 59)).length, 1);
  assert.equal(lookup.blockers(base.customerId, 'nc', [{ ...base, status: 'Fail', completedDate: '2026-11-16' }], new Date(2026, 10, 17, 0, 0)).length, 0);
});
