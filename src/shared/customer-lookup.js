(() => {
  const scenarios = ['eligible', 'new', 'in-progress', 'paused', 'failed-today', 'passed-today', 'failed-earlier', 'no-record', 'connection-error', 'creation-error'];
  const instancePrefix = 'dtiTestInstance:';
  const customerImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e5e7eb"/><circle cx="60" cy="43" r="20" fill="#475569"/><path d="M25 105a35 35 0 0 1 70 0" fill="#475569"/></svg>');
  const customers = [
    { customerId: 'DTI-C-20481', firstName: 'Jordan', middleName: 'Avery', lastName: 'Reyes', suffix: '', dob: '03/14/2007', dlId: 'D12345678', permitNumber: 'LP-7021846', permitStatus: 'Valid', demoSsn: '900001234' },
    { customerId: 'DTI-C-20482', firstName: 'Jordan', middleName: 'Morgan', lastName: 'Reyes', suffix: 'Jr.', dob: '03/14/2007', dlId: 'D87654321', permitNumber: 'LP-7029130', permitStatus: 'Valid', demoSsn: '900005678' }
  ];
  const dateKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  function validDob(value, today = new Date()) {
    const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!parts || parts[3] === '0000') return false;
    const iso = `${parts[3]}-${parts[1]}-${parts[2]}`;
    const date = new Date(iso + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso && iso <= dateKey(today);
  }
  function blockers(customerId, testType, tests, today = new Date()) {
    const matching = tests.filter((test) => test.customerId === customerId && test.testType === testType);
    const messages = [];
    if (matching.some((test) => ['New', 'In Progress'].includes(test.status))) {
      const label = testType === 'nc' ? 'Non-commercial road test' : testType;
      messages.push({ text: 'A ' + label + ' already exists for this customer.' });
    }
    if (matching.some((test) => ['Fail', 'Pass'].includes(test.status) && test.completedDate === dateKey(today))) {
      messages.push({ text: 'Customer has completed this test today and cannot retake.' });
    }
    return messages;
  }
  const pausedTest = (customerId, testType, tests) => tests.find((test) => test.customerId === customerId && test.testType === testType && test.status === 'Paused') || null;
  const statusKey = (verificationQuery) => 'dtiTestStatus:' + window.DTIRouteSession.scopeFor(new URLSearchParams(verificationQuery));
  function savedTests(customerId, testType) {
    const storage = window.sessionStorage;
    const tests = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(instancePrefix)) continue;
      const record = JSON.parse(storage.getItem(key));
      if (record?.customerId !== customerId || record.testType !== testType) continue;
      const update = record.verificationQuery && JSON.parse(storage.getItem(statusKey(record.verificationQuery)));
      tests.push({ ...record, ...update });
    }
    return tests;
  }
  function create(customer, testType, query, scenario) {
    if (scenario === 'creation-error') throw new Error('Simulated test creation failure.');
    const id = 'DTI-' + window.crypto.randomUUID();
    const verification = new URLSearchParams(query);
    verification.set('testId', id);
    const verificationQuery = verification.toString();
    const record = { testId: id, testType, customerId: customer.customerId, status: 'New', createdAt: Date.now(), verificationQuery };
    window.sessionStorage.setItem(instancePrefix + id, JSON.stringify(record));
    return verificationQuery;
  }
  function resume(test, resumedTimestamp, verificationQuery) {
    const update = { status: 'In Progress', resumedTimestamp };
    if (test.verificationQuery) {
      const key = statusKey(test.verificationQuery);
      const saved = JSON.parse(window.sessionStorage.getItem(key));
      window.sessionStorage.setItem(key, JSON.stringify({ ...saved, ...update }));
    } else {
      window.sessionStorage.setItem(instancePrefix + test.testId, JSON.stringify({ ...test, ...update, verificationQuery }));
    }
  }
  function search({ method, identifier, dob, testType, scenario }, today = new Date()) {
    if (!scenarios.includes(scenario) || !['dl', 'ssn'].includes(method)) throw new Error('Invalid demo lookup request.');
    if (scenario === 'connection-error') throw new Error('Simulated MAX connection error.');
    const found = scenario === 'no-record' ? null : customers.find((customer) =>
      (method === 'dl' ? customer.dlId === identifier.trim().toUpperCase() : customer.demoSsn === identifier.trim())
      && customer.dob === dob.trim());
    if (!found) return { customer: null, tests: [] };
    const { demoSsn, ...customer } = found;
    const status = { new: 'New', 'in-progress': 'In Progress', paused: 'Paused', 'failed-today': 'Fail', 'passed-today': 'Pass', 'failed-earlier': 'Fail' }[scenario];
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const tests = status ? [{
      testId: 'DTI-' + (status === 'Paused' ? '0987' : '0986') + (found === customers[0] ? '' : '-B'), customerId: customer.customerId, testType, status, siteId: 'other-demo-site',
      startedAt: status === 'Paused' ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 12, 30).getTime() : null,
      completedDate: ['Fail', 'Pass'].includes(status) ? dateKey(scenario === 'failed-earlier' ? yesterday : today) : null
    }] : [];
    const saved = savedTests(customer.customerId, testType);
    return { customer: { ...customer, customerImage }, tests: [...saved, ...tests.filter((test) => !saved.some((record) => record.testId === test.testId))] };
  }
  window.DTICustomerLookup = { search, blockers, pausedTest, validDob, create, resume };
})();
