(() => {
  const session = window.DTIRouteSession;
  const params = new URLSearchParams(window.location.search);
  const safetyLabels = [
    'Locate speedometer',
    'Engage and disengage emergency brakes',
    'Locate defroster',
    'Locate hazard lights and demonstrate',
    'Demonstrate hand signals (left, right, and stop)',
    'Locate high beams and demonstrate',
    'Locate windshield wipers and demonstrate',
    'When active emergency vehicles approach you, what side of the road must you yield to?'
  ];
  const rubric = [
    { name: 'Vehicle Control', items: [
      { id: 'brakes', label: 'Improper use of brakes', points: 4 },
      { id: 'operation', label: 'Operation of motor vehicle', points: 2 },
      { id: 'steering', label: 'Steering', points: 2 }
    ] },
    { name: 'Stopping', items: [
      { id: 'full-stop', label: 'Fails to make a full stop at a sign/light; two failures = automatic fail', points: 10 },
      { id: 'stop-position', label: 'Position after stopping', points: 2 },
      { id: 'waits', label: 'Waits too long', points: 2 }
    ] },
    { name: 'Yielding & Following', items: [
      { id: 'yield', label: 'Fails to yield', points: 10 },
      { id: 'following', label: 'Following distance', points: 10 }
    ] },
    { name: 'Speed & Traffic Flow', items: [
      { id: 'impeding', label: 'Impeding the flow of traffic', points: 10 },
      { id: 'speeding', label: 'Speeding 5–9 mph', points: 10 },
      { id: 'slow', label: 'Too slow', points: 2 }
    ] },
    { name: 'Lane Positioning & Changes', items: [
      { id: 'center-line', label: 'Crowding center line', points: 10 },
      { id: 'signaling', label: 'Signaling', points: 4 },
      { id: 'lane-choice', label: 'Choice of proper lane', points: 4 },
      { id: 'lane-change', label: 'Improper lane change', points: 4 },
      { id: 'turn', label: 'Improper turn', points: 2 }
    ] },
    { name: 'Seat-Belt Use', items: [
      { id: 'seat-belt', label: 'Not wearing a seat belt', points: 4 }
    ] },
    { name: 'Parking', items: [
      { id: 'curb-hit', label: 'Jump or hit curb', points: 4 },
      { id: 'curb-distance', label: 'Parking too far from curb', points: 4 },
      { id: 'parking-space', label: 'Vehicle outside parking space', points: 4 },
      { id: 'parallel', label: 'Vehicle not parallel with curb', points: 2 }
    ] }
  ];
  const elements = rubric.flatMap((group) => group.items);
  const stopFailureReason = 'Two failures to make a full stop at a sign/light';
  const manualFailureReasons = ['Dangerous action', 'Collision or striking an object', 'Examiner had to intervene', 'Disobeyed traffic signal or sign'];
  const middleName = (params.get('middleName') || (params.has('firstName') || params.has('lastName') ? '' : 'A')).trim();
  const customerName = [(params.get('firstName') || 'Jordan').trim(), middleName ? middleName.charAt(0).toUpperCase() + '.' : '', (params.get('lastName') || 'Reyes').trim()].filter(Boolean).join(' ');
  const identity = {
    testId: params.get('testId') || 'DTI-1042', testKey: session.roadTestStorageKey,
    customerName, testType: session.context.testType,
    testTypeLabel: session.context.testType === 'nc' ? 'Non-commercial road test' : session.context.testType === 'commercial' ? 'Commercial road test' : session.context.testType,
    siteId: session.context.siteId, siteName: session.context.siteName
  };
  const totalPoints = (saved) => saved.some((error) => error.points === null) ? null : saved.reduce((total, error) => total + error.points, 0);
  const validTime = (value) => Number.isFinite(value) && value > 0;
  const validLocation = (value) => value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 && value.simulated === true;
  const uuid = () => window.crypto.randomUUID();
  const elapsed = (startedAt, timestamp) => {
    const seconds = startedAt === null ? 0 : Math.max(0, Math.floor((timestamp - startedAt) / 1000));
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  };
  const stamp = () => ({ savedAt: Date.now(), location: { latitude: 33.4884, longitude: -112.1494, simulated: true }, loc: '33.4884, -112.1494' });
  const assertActive = (record) => {
    if (!record.startedAt || record.endedAt !== null) throw new Error('The road test is not active.');
  };
  const stopConfirmationRequired = (record) => record.saved.filter((error) => error.source === 'road' && error.elementId === 'full-stop').length >= 2 && !record.events.some((event) => event.type === 'automatic-failure');
  function validate(record) {
    if (!record || record.schemaVersion !== 2 || record.testKey !== identity.testKey
      || (record.startedAt !== null && !validTime(record.startedAt))
      || (record.endedAt !== null && (!validTime(record.endedAt) || !record.startedAt || record.endedAt < record.startedAt))
      || !Array.isArray(record.saved) || !record.saved.every((error) => error && typeof error.id === 'string' && error.testKey === identity.testKey
        && typeof error.label === 'string' && typeof error.note === 'string' && typeof error.loc === 'string' && typeof error.time === 'string'
        && (error.source === 'road' || error.source === 'safety')
        && ((Number.isInteger(error.points) && error.points > 0) || (error.legacy && error.points === null))
        && (validTime(error.savedAt) || (error.legacy && error.savedAt === null))
        && (validLocation(error.location) || (error.legacy && error.location === null)))
      || new Set(record.saved.map((error) => error.id)).size !== record.saved.length
      || !record.safetyResults || typeof record.safetyResults !== 'object' || Array.isArray(record.safetyResults)
      || !Object.entries(record.safetyResults).every(([id, value]) => safetyLabels[Number(id)] && String(Number(id)) === id && (value === 'pass' || value === 'fail'))
      || typeof record.safetyNote !== 'string'
      || !Array.isArray(record.events) || !record.events.every((event) => event && typeof event.id === 'string' && event.testKey === identity.testKey
        && ['automatic-failure', 'test-ended'].includes(event.type) && typeof event.reason === 'string' && validTime(event.savedAt) && validLocation(event.location))) {
      throw new Error('Invalid saved road test.');
    }
    if (record.evaluationPoints !== undefined && (!Array.isArray(record.evaluationPoints) || !record.evaluationPoints.every((point) =>
      point && typeof point.id === 'string' && point.testKey === identity.testKey && Number.isInteger(point.number) && point.number > 0
      && typeof point.name === 'string' && typeof point.street === 'string' && validTime(point.savedAt)
      && ['scored', 'skipped'].includes(point.status) && point.simulated === true
      && typeof point.skipReason === 'string' && (point.status !== 'skipped' || point.skipReason.trim())))) {
      throw new Error('Invalid saved evaluation points.');
    }
    if (record.submission !== undefined && (!record.submission || record.submission.mode !== 'mock'
      || record.submission.status !== 'saved-locally' || !validTime(record.submission.submittedAt)
      || record.submission.payload?.testKey !== identity.testKey || record.endedAt === null)) {
      throw new Error('Invalid saved prototype submission.');
    }
    return record;
  }
  function create(started = true) {
    return { schemaVersion: 2, ...identity, routeId: session.load()?.routeId || null, startedAt: started ? Date.now() : null, endedAt: null, saved: [], safetyResults: {}, safetyNote: '', events: [], totalErrorPoints: 0, handoff: null };
  }
  function read() {
    const raw = window.sessionStorage.getItem(identity.testKey);
    if (raw === null) return null;
    let record = JSON.parse(raw);
    if (record && record.schemaVersion === undefined) {
      if ((record.startedAt !== null && !validTime(record.startedAt)) || !record.safetyResults || typeof record.safetyNote !== 'string'
        || !Array.isArray(record.saved) || !record.saved.every((error) => error && typeof error.label === 'string' && typeof error.note === 'string' && typeof error.loc === 'string' && typeof error.time === 'string' && ['road', 'safety'].includes(error.source))) throw new Error('Invalid earlier prototype record.');
      const aliases = { 'Impeding flow of traffic': 'impeding', 'Not wearing seatbelt': 'seat-belt', 'Parked too far from curb': 'curb-distance', 'Vehicle outside of parking space': 'parking-space', 'Vehicle not parallel with curb': 'parallel' };
      record = { ...create(false), ...record, saved: record.saved.map((error, index) => {
        const element = elements.find((item) => item.label === error.label || item.id === aliases[error.label]);
        return { ...error, id: 'legacy-' + index, testKey: identity.testKey, elementId: error.source === 'safety' ? 'safety-' + error.itemId : element?.id || null, points: error.source === 'safety' ? 1 : element?.points ?? null, savedAt: null, location: null, legacy: true };
      }) };
    }
    validate(record);
    return { ...record, totalErrorPoints: totalPoints(record.saved) };
  }
  function write(record) {
    const next = validate({ ...record, totalErrorPoints: totalPoints(record.saved), ...(record.endedAt !== null ? { result: calculateResult(record) } : {}) });
    window.sessionStorage.setItem(identity.testKey, JSON.stringify(next));
    return next;
  }
  function makeLines(record, selected, note) {
    assertActive(record);
    const captured = stamp();
    const batchId = uuid();
    return selected.map((element) => ({
      id: uuid(), testKey: identity.testKey, batchId, source: element.source || 'road', elementId: element.id,
      label: element.label, points: element.points, note, ...captured, time: elapsed(record.startedAt, captured.savedAt)
    }));
  }
  function end(record, reason = null) {
    assertActive(record);
    if (stopConfirmationRequired(record) && !reason) throw new Error('Confirm the full-stop automatic failure before ending.');
    if (reason !== null && !manualFailureReasons.concat(stopFailureReason).includes(reason)) throw new Error('Select an automatic-failure reason.');
    const captured = stamp();
    const event = (type, eventReason) => ({ id: uuid(), testKey: identity.testKey, type, reason: eventReason, ...captured });
    const events = record.events.concat(reason ? [event('automatic-failure', reason)] : [], event('test-ended', reason ? 'Automatic failure' : 'Examiner ended the test'));
    const ended = { ...record, endedAt: captured.savedAt, events, totalErrorPoints: totalPoints(record.saved) };
    ended.handoff = {
      mode: 'mock', status: 'simulated', preparedAt: captured.savedAt,
      payload: {
        testId: record.testId, testKey: record.testKey, customerName: record.customerName, testType: record.testType,
        siteId: record.siteId, routeId: record.routeId, startedAt: record.startedAt, endedAt: ended.endedAt,
        errors: record.saved, safetyResults: record.safetyResults, safetyNote: record.safetyNote, events,
        totalErrorPoints: ended.totalErrorPoints,
        recordings: { simulated: true, cameraConnected: session.cameraConnected, mediaFiles: [] }
      }
    };
    return ended;
  }
  function calculateResult(record) {
    const failed = record.events.some((event) => event.type === 'automatic-failure');
    return {
      outcome: failed ? 'fail' : 'pending',
      reason: failed ? 'Recorded automatic failure' : 'Normal scoring rule is not configured',
      errorPoints: totalPoints(record.saved), score: null, ruleStatus: 'not-configured'
    };
  }
  function prepareReview(record) {
    validate(record);
    if (record.endedAt === null) throw new Error('End the road test before reviewing it.');
    // Sample evaluation points are separate from examiner-recorded evidence and never add points.
    const evaluationPoints = record.evaluationPoints === undefined ? [
      { number: 1, name: 'Right turn', street: 'Demo Oak Street', status: 'scored', skipReason: '', fraction: 0.2 },
      { number: 2, name: 'Lane change', street: 'Demo Pine Avenue', status: 'skipped', skipReason: 'Road closure (simulated)', fraction: 0.5 },
      { number: 3, name: 'Controlled intersection', street: 'Demo Cedar Drive', status: 'scored', skipReason: '', fraction: 0.8 }
    ].map(({ fraction, ...point }) => ({
      ...point, id: uuid(), testKey: identity.testKey, simulated: true,
      savedAt: record.startedAt + Math.floor((record.endedAt - record.startedAt) * fraction)
    })) : record.evaluationPoints;
    return { ...record, evaluationPoints, result: calculateResult(record) };
  }
  function reviewData(record) {
    const duration = record.endedAt - record.startedAt;
    const evaluations = record.evaluationPoints || [];
    const rows = evaluations.map((point) => ({
      ...point, kind: point.status, label: point.status === 'skipped' ? point.skipReason : point.name,
      locationLabel: point.street, note: ''
    })).concat(record.saved.map((error) => ({
      ...error, kind: 'error', label: (error.source === 'safety' ? 'Basic Safety · ' : '') + error.label,
      locationLabel: error.location ? error.loc + ' (simulated GPS)' : 'GPS not captured', simulated: false
    }))).sort((a, b) => (a.savedAt ?? Infinity) - (b.savedAt ?? Infinity));
    const plottable = rows.filter((entry) => entry.savedAt !== null && entry.savedAt >= record.startedAt && entry.savedAt <= record.endedAt);
    const width = Math.max(720, Math.ceil(duration / 180000) * 100);
    const lanes = { error: [], evaluation: [] };
    const markers = plottable.map((entry) => {
      const position = duration === 0 ? 0 : (entry.savedAt - record.startedAt) / duration * 100;
      const x = position / 100 * width;
      const ends = lanes[entry.kind === 'error' ? 'error' : 'evaluation'];
      let lane = ends.findIndex((previous) => x - previous >= (entry.kind === 'error' ? 48 : 36));
      if (lane === -1) lane = ends.length;
      ends[lane] = x;
      return { ...entry, position, lane, elapsed: elapsed(record.startedAt, entry.savedAt) };
    });
    const lineY = 30 + lanes.error.length * 48;
    const ticks = [{ label: '00:00', position: 0 }];
    for (let ms = 180000; ms < duration; ms += 180000) ticks.push({ label: elapsed(record.startedAt, record.startedAt + ms), position: ms / duration * 100 });
    ticks.push({ label: elapsed(record.startedAt, record.endedAt), position: 100 });
    return {
      rows, markers: markers.map((entry) => ({ ...entry, top: entry.kind === 'error' ? lineY - 48 * (entry.lane + 1) : lineY + entry.lane * 32 })),
      ticks, lineY, width, height: lineY + Math.max(1, lanes.evaluation.length) * 32 + 64,
      tickTop: lineY + Math.max(1, lanes.evaluation.length) * 32 + 10,
      unplottedCount: rows.length - plottable.length,
      scored: evaluations.filter((point) => point.status === 'scored').length,
      skipped: evaluations.filter((point) => point.status === 'skipped').length
    };
  }
  function submit(record) {
    validate(record);
    if (record.endedAt === null) throw new Error('End the road test before submitting it.');
    discard();
  }
  function discard() {
    session.clear();
    window.sessionStorage.removeItem(identity.testKey);
    if (session.instanceKey && window.sessionStorage.getItem(session.instanceKey)) {
      session.clearPreExam();
      window.sessionStorage.removeItem(session.statusKey);
      window.sessionStorage.removeItem(session.instanceKey);
    }
  }
  window.DTIRoadTest = {
    rubric, elements, safetyLabels, identity, manualFailureReasons, stopFailureReason,
    create, read, write, makeLines, end, assertActive, stopConfirmationRequired, elapsed,
    calculateResult, prepareReview, reviewData, submit, discard,
    formatDate: (timestamp) => timestamp === null ? 'Not captured' : new Date(timestamp).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    formatTime: (timestamp) => timestamp === null ? 'Not captured' : new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  };
})();
