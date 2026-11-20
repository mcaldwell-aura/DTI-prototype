(() => {
  const params = new URLSearchParams(window.location.search);
  const siteId = params.get('siteId') || params.get('location') || 'west-phoenix';
  const context = {
    testType: params.get('testType') || 'nc',
    siteId: siteId === 'West Phoenix MVD' ? 'west-phoenix' : siteId,
    siteName: params.get('location') || (siteId === 'west-phoenix' ? 'West Phoenix MVD' : siteId)
  };
  const routes = [
    { id: 'west-loop-a', name: 'West Loop A', minutes: 22, miles: 5.4, testType: 'nc', siteId: 'west-phoenix', enabled: true, variant: 'a' },
    { id: 'west-loop-b', name: 'West Loop B', minutes: 18, miles: 4.2, testType: 'nc', siteId: 'west-phoenix', enabled: true, variant: 'b' },
    { id: 'neighborhood-c', name: 'Neighborhood C', minutes: 15, miles: 3.1, testType: 'nc', siteId: 'west-phoenix', enabled: true, variant: 'c' },
    { id: 'inactive-loop', name: 'Inactive Loop', minutes: 20, miles: 4.8, testType: 'nc', siteId: 'west-phoenix', enabled: false, variant: 'a' },
    { id: 'east-loop', name: 'East Demo Loop', minutes: 19, miles: 4.6, testType: 'nc', siteId: 'east-demo', enabled: true, variant: 'b' },
    { id: 'commercial-loop', name: 'Commercial Practice Loop', minutes: 30, miles: 8.2, testType: 'commercial', siteId: 'west-phoenix', enabled: true, variant: 'a' }
  ];
  const eligibleRoutes = routes.filter((route) => route.enabled && route.testType === context.testType && route.siteId === context.siteId);
  const scopeFor = (query) => {
    const site = query.get('siteId') || query.get('location') || 'west-phoenix';
    return JSON.stringify([
      query.get('testId') || 'DTI-1042',
      query.get('customerId') || query.get('dlId') || [query.get('firstName'), query.get('middleName'), query.get('lastName'), query.get('dob')],
      query.get('testType') || 'nc', site === 'West Phoenix MVD' ? 'west-phoenix' : site, query.get('appointmentDate')
    ]);
  };
  const testScope = scopeFor(params);
  const storageKey = 'dtiTestRoute:' + testScope;
  const checksKey = 'dtiPreTestChecks:' + testScope;
  const fieldsKey = (screen) => 'dtiPreExamFields:' + testScope + ':' + screen;
  window.DTIRouteSession = {
    context,
    eligibleRoutes,
    scopeFor,
    instanceKey: params.has('testId') ? 'dtiTestInstance:' + params.get('testId') : null,
    statusKey: 'dtiTestStatus:' + testScope,
    checksKey, fieldsKey,
    clearPreExam: () => [checksKey, fieldsKey('Customer Information'), fieldsKey('Acknowledge')].forEach((key) => window.sessionStorage.removeItem(key)),
    roadTestStorageKey: 'dtiRoadTest:' + testScope,
    clear: () => window.sessionStorage.removeItem(storageKey),
    cameraConnected: params.get('cameraConnected') !== 'false',
    url: (screen) => screen + window.location.search,
    load: () => {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw === null) return null;
      const record = JSON.parse(raw);
      if (!record || (record.routeId !== null && typeof record.routeId !== 'string')) throw new Error('Invalid saved route selection');
      return record;
    },
    save: (routeId) => {
      if (routeId !== null && !eligibleRoutes.some((route) => route.id === routeId)) throw new Error('Selected route is not eligible');
      window.sessionStorage.setItem(storageKey, JSON.stringify({ routeId, testType: context.testType, siteId: context.siteId }));
    }
  };
})();
