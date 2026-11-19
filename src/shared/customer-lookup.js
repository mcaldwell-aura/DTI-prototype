(() => {
  const scenarios = ['eligible', 'new', 'in-progress', 'paused', 'failed-today', 'failed-earlier', 'no-record', 'connection-error'];
  const customers = [
    { customerId: 'DTI-C-20481', firstName: 'Jordan', middleName: 'Avery', lastName: 'Reyes', suffix: '', dob: '03/14/2007', dlId: 'D12345678', permitNumber: 'LP-7021846', permitStatus: 'Valid', demoSsn: '900001234' },
    { customerId: 'DTI-C-20482', firstName: 'Jordan', middleName: 'Morgan', lastName: 'Reyes', suffix: '', dob: '03/14/2007', dlId: 'D87654321', permitNumber: 'LP-7029130', permitStatus: 'Valid', demoSsn: '900005678' }
  ];
  const dateKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  function blockers(customerId, testType, tests, today = new Date()) {
    const matching = tests.filter((test) => test.customerId === customerId && test.testType === testType);
    const messages = [];
    if (matching.some((test) => ['New', 'In Progress'].includes(test.status))) {
      const label = testType === 'nc' ? 'Non-commercial road test' : testType;
      messages.push('A ' + label + ' already exists for this customer.');
    }
    if (matching.some((test) => test.status === 'Fail' && test.completedDate === dateKey(today))) {
      messages.push('Customer has completed this test today and cannot retake.');
    }
    return messages;
  }
  const pausedTest = (customerId, testType, tests) => tests.find((test) => test.customerId === customerId && test.testType === testType && test.status === 'Paused') || null;
  function search({ method, identifier, dob, testType, scenario }, today = new Date()) {
    if (!scenarios.includes(scenario) || !['dl', 'ssn'].includes(method)) throw new Error('Invalid demo lookup request.');
    if (scenario === 'connection-error') throw new Error('Simulated MAX connection error.');
    const found = scenario === 'no-record' ? null : customers.find((customer) =>
      (method === 'dl' ? customer.dlId === identifier.trim().toUpperCase() : customer.demoSsn === identifier.trim())
      && customer.dob === dob.trim());
    if (!found) return { customer: null, tests: [] };
    const { demoSsn, ...customer } = found;
    const status = { new: 'New', 'in-progress': 'In Progress', paused: 'Paused', 'failed-today': 'Fail', 'failed-earlier': 'Fail' }[scenario];
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const tests = status ? [{
      testId: 'DTI-' + (status === 'Paused' ? '0987' : '0986'), customerId: customer.customerId, testType, status, siteId: 'other-demo-site',
      startedAt: status === 'Paused' ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 12, 30).getTime() : null,
      completedDate: status === 'Fail' ? dateKey(scenario === 'failed-today' ? today : yesterday) : null
    }] : [];
    return { customer, tests };
  }
  window.DTICustomerLookup = { search, blockers, pausedTest };
})();
