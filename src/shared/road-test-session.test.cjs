const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');

function harness(search = '?testId=rubric-test', storage = new Map()) {
  let now = Date.UTC(2026, 10, 16, 21, 30);
  let failWrites = false;
  class Clock extends Date { static now() { return now; } }
  class Logic {
    constructor(props = {}) { this.props = props; this.state = {}; }
    setState(patch) { this.state = { ...this.state, ...patch }; }
  }
  const navigations = [];
  const window = {
    location: { search, assign: (url) => navigations.push(url) },
    crypto: { randomUUID },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (failWrites) throw new Error('Mock storage write failure');
        storage.set(key, value);
      },
      removeItem: (key) => {
        if (failWrites) throw new Error('Mock storage removal failure');
        storage.delete(key);
      }
    }
  };
  const context = vm.createContext({ window, URLSearchParams, Date: Clock, DCLogic: Logic });
  for (const file of ['route-session.js', 'road-test-session.js']) {
    vm.runInContext(readFileSync(join(__dirname, file), 'utf8'), context);
  }
  const component = (file) => {
    const html = readFileSync(join(__dirname, '..', file), 'utf8');
    const code = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
    const Component = vm.runInContext('(function () {' + code + '; return Component; })()', context);
    return new Component();
  };
  return {
    model: window.DTIRoadTest, session: window.DTIRouteSession, storage, navigations, component,
    advance: (ms) => { now += ms; },
    failWrites: (value) => { failWrites = value; }
  };
}

function select(component, id) {
  const view = component.renderVals();
  const element = view.groups.flatMap((group) => group.items).find((item) => item.label === id);
  assert.ok(element, 'Rubric element must be selectable: ' + id);
  element.pick();
}

test('every rubric element saves its weight and separate, shared-batch evidence; repeat occurrences remain separate', () => {
  const h = harness();
  const model = h.model;
  let record = model.write(model.create());
  h.advance(1000);
  const lines = model.makeLines(record, model.elements, '');
  record = model.write({ ...record, saved: lines });
  assert.deepEqual(Array.from(lines, (line) => line.points), [4, 2, 2, 10, 2, 2, 10, 10, 10, 10, 2, 10, 4, 4, 4, 2, 4, 4, 4, 4, 2]);
  assert.equal(record.totalErrorPoints, 106);
  assert.equal(new Set(lines.map((line) => line.id)).size, 21);
  assert.equal(new Set(lines.map((line) => line.batchId)).size, 1);
  assert.equal(new Set(lines.map((line) => line.savedAt)).size, 1);
  assert.equal(new Set(lines.map((line) => JSON.stringify(line.location))).size, 1);
  assert.ok(lines.every((line) => line.testKey === record.testKey && line.location.simulated && line.note === ''));
  h.advance(2000);
  const repeated = model.makeLines(record, [model.elements[0]], 'Second observation');
  record = model.write({ ...record, saved: record.saved.concat(repeated) });
  assert.equal(record.saved.length, 22);
  assert.equal(record.totalErrorPoints, 110);
  assert.notEqual(repeated[0].id, lines[0].id);
  assert.notEqual(repeated[0].savedAt, lines[0].savedAt);
  assert.notEqual(repeated[0].batchId, lines[0].batchId);
  assert.equal(model.read().saved.length, 22);
  assert.equal(harness('?testId=another-test', h.storage).model.read(), null);
});

test('notes edit only the chosen occurrence and preserve evidence timestamps, points, and other notes', () => {
  const h = harness();
  const component = h.component('07-road-test.html');
  select(component, 'Improper use of brakes');
  select(component, 'Operation of motor vehicle');
  let view = component.renderVals();
  view.changeNote({ currentTarget: { value: 'Shared initial note' } });
  component.renderVals().save();
  const before = h.model.read();
  view = component.renderVals();
  view.saved[0].editNote();
  view = component.renderVals();
  view.changeEditingNote({ currentTarget: { value: 'Specific note' } });
  component.renderVals().saveEditedNote();
  let after = h.model.read();
  assert.equal(after.saved.filter((line) => line.note === 'Specific note').length, 1);
  assert.equal(after.saved.filter((line) => line.note === 'Shared initial note').length, 1);
  assert.deepEqual(after.saved.map((line) => line.savedAt), before.saved.map((line) => line.savedAt));
  assert.equal(after.totalErrorPoints, 6);
  component.renderVals().saved[0].editNote();
  component.renderVals().changeEditingNote({ currentTarget: { value: '' } });
  component.renderVals().saveEditedNote();
  after = h.model.read();
  assert.equal(after.saved.filter((line) => line.note === '').length, 1);
  view = component.renderVals();
  assert.equal('totalErrorPoints' in view, false);
  assert.equal('safetyPoints' in view, false);
  assert.equal('savedSafetyPoints' in view, false);
});

test('Basic Safety still requires all answers and preserves individual notes when another item changes', () => {
  const h = harness();
  const c = h.component('07-road-test.html');
  for (let i = 0; i < 8; i++) {
    const view = c.renderVals();
    assert.ok(view.cannotSaveSafety);
    (i === 0 ? view.safetyItems[i].fail : view.safetyItems[i].pass)();
  }
  c.renderVals().saveSafety();
  const original = h.model.read().saved[0];
  c.renderVals().saved[0].editNote();
  c.renderVals().changeEditingNote({ currentTarget: { value: 'Item-specific note' } });
  c.renderVals().saveEditedNote();
  h.advance(3000);
  c.renderVals().safetyItems[1].fail();
  c.renderVals().saveSafety();
  let record = h.model.read();
  assert.equal(record.totalErrorPoints, 2);
  assert.equal(record.saved.length, 2);
  assert.equal(record.saved[0].id, original.id);
  assert.equal(record.saved[0].savedAt, original.savedAt);
  assert.equal(record.saved[0].note, 'Item-specific note');
  c.renderVals().safetyItems[0].pass();
  c.renderVals().saveSafety();
  record = h.model.read();
  assert.equal(record.saved.length, 1);
  assert.equal(record.totalErrorPoints, 1);
});

test('the second full-stop occurrence prompts confirmation, persists on cancel, and ends only after successful confirmation', () => {
  const h = harness();
  const c = h.component('07-road-test.html');
  const label = h.model.elements.find((element) => element.id === 'full-stop').label;
  select(c, label);
  c.renderVals().save();
  assert.equal(c.renderVals().showFail, false);
  h.advance(1000);
  select(c, label);
  c.renderVals().save();
  let view = c.renderVals();
  assert.equal(view.showFail, true);
  assert.equal(view.cannotSaveFailure, false);
  view.closeModal();
  assert.equal(h.model.read().saved.length, 2);
  assert.equal(h.model.read().endedAt, null);
  assert.equal(h.model.read().events.length, 0);
  c.renderVals().openEnd();
  assert.equal(c.renderVals().showFail, true);
  h.failWrites(true);
  c.renderVals().saveFailure();
  assert.equal(c.renderVals().showSaveError, true);
  assert.equal(h.model.read().endedAt, null);
  assert.equal(h.navigations.length, 0);
  h.failWrites(false);
  h.advance(1000);
  c.renderVals().saveFailure();
  const ended = h.model.read();
  assert.equal(ended.events.length, 2);
  assert.equal(ended.events[0].type, 'automatic-failure');
  assert.equal(ended.events[0].reason, h.model.stopFailureReason);
  assert.equal(ended.events[0].savedAt, ended.endedAt);
  assert.equal(ended.events[1].savedAt, ended.endedAt);
  assert.equal(ended.totalErrorPoints, 20);
  assert.equal(ended.handoff.status, 'simulated');
  assert.equal(ended.handoff.payload.errors.length, 2);
  assert.equal(ended.handoff.payload.events.length, 2);
  assert.equal(ended.handoff.payload.recordings.mediaFiles.length, 0);
  assert.match(h.navigations[0], /08-review-and-submit\.html\?testId=rubric-test/);
  const timer = c.renderVals().timer;
  h.advance(61000);
  assert.equal(c.renderVals().timer, timer);
  assert.equal(c.renderVals().inactive, true);
  assert.throws(() => h.model.end(ended), /not active/);
  assert.equal(h.component('08-review-and-submit.html').renderVals().outcome, 'Automatic fail');
});

test('normal ending requires confirmation only, records an official end and mock handoff, and survives reload', () => {
  const h = harness();
  h.session.save('west-loop-b');
  const c = h.component('07-road-test.html');
  assert.equal(c.renderVals().cannotSaveSafety, true);
  c.renderVals().openEnd();
  assert.equal(c.renderVals().showEnd, true);
  c.renderVals().closeModal();
  assert.equal(h.model.read().endedAt, null);
  h.advance(65000);
  c.renderVals().endTest();
  const ended = h.model.read();
  assert.equal(ended.events.length, 1);
  assert.equal(ended.events[0].type, 'test-ended');
  assert.equal(ended.endedAt, ended.startedAt + 65000);
  assert.equal(ended.handoff.payload.endedAt, ended.endedAt);
  assert.equal(ended.handoff.payload.testKey, ended.testKey);
  assert.equal(ended.handoff.payload.routeId, 'west-loop-b');
  const restored = h.component('07-road-test.html').renderVals();
  assert.equal(restored.timer, '01:05');
  assert.equal(restored.hasEnded, true);
  const review = h.component('08-review-and-submit.html').renderVals();
  assert.equal(review.outcome, 'Result pending');
  assert.equal(review.duration, '01:05');
  assert.equal(review.points, 0);
  assert.match(review.summary, /West Loop B/);
});

test('earlier prototype records retain evidence without inventing timestamps or ambiguous point values', () => {
  const h = harness();
  const record = h.model.create();
  h.storage.set(record.testKey, JSON.stringify({
    startedAt: record.startedAt, safetyResults: {}, safetyNote: '',
    saved: [{ source: 'road', label: 'Speeding', time: '00:03', loc: '33.4884, -112.1494', note: 'Earlier observation' }]
  }));
  const restored = h.model.read();
  assert.equal(restored.saved[0].savedAt, null);
  assert.equal(restored.saved[0].points, null);
  assert.equal(restored.totalErrorPoints, null);
  assert.equal(restored.saved[0].note, 'Earlier observation');
  assert.equal(h.component('07-road-test.html').renderVals().hasLegacyErrors, true);
  h.storage.set(record.testKey, '{broken JSON');
  assert.equal(h.component('07-road-test.html').renderVals().showLoadError, true);
  assert.equal(h.component('08-review-and-submit.html').renderVals().showLoadError, true);
});

test('Review projects chronological errors and explicitly simulated evaluation points onto elapsed time with three-minute ticks', () => {
  const h = harness();
  let record = h.model.write(h.model.create());
  h.advance(120000);
  const first = h.model.makeLines(record, [h.model.elements[0]], 'First note');
  h.advance(240000);
  const batch = h.model.makeLines(record, [h.model.elements[1], h.model.elements[2]], '');
  record = h.model.write({ ...record, saved: batch.concat(first) });
  h.advance(490000);
  h.model.write(h.model.end(record));
  const view = h.component('08-review-and-submit.html').renderVals();
  record = h.model.read();
  assert.equal(view.duration, '14:10');
  assert.equal(view.evidenceSummary, '2 scored, 1 skipped, 3 errors');
  assert.deepEqual(Array.from(view.ticks, (tick) => tick.label), ['00:00', '03:00', '06:00', '09:00', '12:00', '14:10']);
  assert.ok(record.evaluationPoints.every((point) => point.simulated && point.testKey === record.testKey));
  assert.equal(record.evaluationPoints[1].skipReason, 'Road closure (simulated)');
  assert.equal(record.totalErrorPoints, 8, 'Simulated evaluations do not change the score');
  assert.deepEqual(Array.from(view.rows, (entry) => entry.savedAt), Array.from(view.rows, (entry) => entry.savedAt).sort((a, b) => a - b));
  assert.ok(view.rows.every((entry) => /^\d{2}:\d{2}:\d{2} [AP]M$/.test(entry.timestamp)));
  assert.equal(view.rows.find((entry) => entry.id === first[0].id).locationLabel, '33.4884, -112.1494 (simulated GPS)');
  assert.equal(view.rows.find((entry) => entry.kind === 'skipped').label, 'Road closure (simulated)');
  const firstMarker = view.markers.find((entry) => entry.id === first[0].id);
  assert.equal(firstMarker.elapsed, '02:00');
  assert.equal(firstMarker.position, 120 / 850 * 100);
  assert.ok(firstMarker.top < h.model.reviewData(record).lineY);
  const simultaneous = view.markers.filter((entry) => entry.savedAt === batch[0].savedAt);
  assert.equal(new Set(simultaneous.map((entry) => entry.position)).size, 1);
  assert.equal(new Set(simultaneous.map((entry) => entry.top)).size, 2, 'Same-time errors remain separately visible');
  const samples = JSON.stringify(record.evaluationPoints);
  h.advance(10000);
  h.component('08-review-and-submit.html').renderVals();
  assert.equal(JSON.stringify(h.model.read().evaluationPoints), samples, 'Demo events remain stable across reload');
});

test('timeline handles zero duration, exact three-minute boundaries, and missing legacy timestamps honestly', () => {
  const h = harness();
  let record = h.model.write(h.model.create());
  let ended = h.model.prepareReview(h.model.end(record));
  let data = h.model.reviewData(ended);
  assert.deepEqual(Array.from(data.ticks, (tick) => tick.label), ['00:00', '00:00']);
  assert.ok(data.markers.every((marker) => marker.position === 0 && Number.isFinite(marker.top)));
  h.advance(180000);
  ended = h.model.prepareReview(h.model.end(record));
  data = h.model.reviewData(ended);
  assert.deepEqual(Array.from(data.ticks, (tick) => tick.label), ['00:00', '03:00']);
  const legacy = { ...h.model.makeLines(record, [h.model.elements[0]], '')[0], savedAt: null, location: null, legacy: true };
  record = h.model.write({ ...ended, saved: [legacy] });
  const view = h.component('08-review-and-submit.html').renderVals();
  assert.equal(view.unplottedCount, 1);
  assert.equal(view.markers.filter((marker) => marker.isError).length, 0);
  assert.equal(view.rows.at(-1).timestamp, 'Not captured');
  assert.equal(view.rows.at(-1).locationLabel, 'GPS not captured');
  assert.equal(record.saved[0].savedAt, null);
});

test('unknown normal scoring persists as pending at low and high point totals; recorded automatic failure overrides it', () => {
  const h = harness();
  let record = h.model.write(h.model.create());
  let ended = h.model.write(h.model.end(record));
  assert.equal(ended.result.outcome, 'pending');
  assert.equal(ended.result.errorPoints, 0);
  assert.equal(ended.result.score, null);
  const saved = h.model.makeLines(record, Array(30).fill(h.model.elements[0]), '');
  record = h.model.write({ ...record, saved });
  ended = h.model.write(h.model.end(record));
  assert.equal(ended.result.outcome, 'pending');
  assert.equal(ended.result.errorPoints, 120);
  assert.equal(ended.result.score, null);
  ended = h.model.write(h.model.end(record, h.model.manualFailureReasons[0]));
  assert.equal(h.model.read().result.outcome, 'fail');
  assert.equal(ended.result.reason, 'Recorded automatic failure');
  assert.equal(h.model.prepareReview(ended).result.outcome, 'fail');
});

test('demo submission clears only this run, handles removal failures, and allows repeated fresh tests', () => {
  const h = harness();
  h.session.save('west-loop-a');
  h.storage.set('unrelated-preference', 'keep');
  const other = harness('?testId=another-demo', h.storage);
  other.model.write(other.model.create());
  const otherRecord = h.storage.get(other.model.identity.testKey);
  let record = h.model.write(h.model.create());
  h.advance(2000);
  record = h.model.write({ ...record, saved: h.model.makeLines(record, [h.model.elements[0]], 'Saved note') });
  h.model.write(h.model.end(record));
  const before = h.storage.get(record.testKey);
  h.failWrites(true);
  const c = h.component('08-review-and-submit.html');
  let view = c.renderVals();
  assert.equal(view.showSaveError, true);
  assert.equal(view.cannotSubmit, true);
  assert.equal(view.handoffStatus, 'Review not saved');
  assert.equal(h.storage.get(record.testKey), before);
  h.failWrites(false);
  view.retrySave();
  view = c.renderVals();
  assert.equal(view.showSaveError, false);
  assert.equal(view.cannotSubmit, false);
  h.failWrites(true);
  view.submitTest();
  view = c.renderVals();
  assert.equal(view.showSaveError, true);
  assert.equal(h.navigations.length, 0);
  assert.equal(h.session.load().routeId, 'west-loop-a');
  assert.equal(h.model.read().submission, undefined);
  h.failWrites(false);
  view.retrySave();
  view = c.renderVals();
  assert.equal(view.cannotSubmit, true);
  assert.equal(view.showSaveError, false);
  assert.equal(h.model.read(), null);
  assert.equal(h.storage.has(record.testKey), false);
  assert.equal(h.session.load(), null);
  assert.match(h.navigations[0], /^02-start-a-test\.html\?testId=rubric-test$/);
  assert.equal(h.storage.get('unrelated-preference'), 'keep');
  assert.equal(h.storage.get(other.model.identity.testKey), otherRecord);
  c.renderVals().submitTest();
  assert.equal(h.navigations.length, 1, 'Duplicate clicks do not submit or navigate twice');
  h.advance(10000);
  for (let run = 0; run < 2; run++) {
    const active = h.component('07-road-test.html');
    const fresh = active.renderVals();
    assert.equal(fresh.hasEnded, false);
    assert.equal(fresh.timer, '00:00');
    assert.equal(fresh.count, 0);
    assert.equal(fresh.cannotSaveSafety, true);
    assert.equal(h.model.read().events.length, 0);
    assert.equal(h.model.read().totalErrorPoints, 0);
    assert.equal(h.model.read().safetyResults[0], undefined);
    assert.equal(h.model.read().routeId, null);
    h.advance(2000);
    active.renderVals().endTest();
    h.component('08-review-and-submit.html').renderVals().submitTest();
    assert.equal(h.model.read(), null);
    assert.equal(h.session.load(), null);
  }
  assert.equal(h.navigations.length, 5);
  const active = h.model.create();
  assert.throws(() => h.model.submit(active), /End the road test/);
});

test('previously submitted or ended demos can be cleared from Review or restarted from the ended-test screen', () => {
  const h = harness();
  h.session.save('west-loop-b');
  const ended = h.model.end(h.model.create());
  h.model.write({
    ...ended, submission: { mode: 'mock', status: 'saved-locally', submittedAt: ended.endedAt, payload: ended.handoff.payload }
  });
  const review = h.component('08-review-and-submit.html').renderVals();
  assert.equal(review.cannotSubmit, false, 'An old submission no longer locks the demo');
  const road = h.component('07-road-test.html');
  assert.equal(road.renderVals().hasEnded, true);
  h.failWrites(true);
  road.renderVals().restartDemo();
  assert.equal(road.renderVals().showSaveError, true);
  assert.equal(h.navigations.length, 0);
  assert.notEqual(h.model.read(), null);
  h.failWrites(false);
  road.renderVals().restartDemo();
  assert.equal(h.model.read(), null);
  assert.equal(h.session.load(), null);
  assert.match(h.navigations[0], /^02-start-a-test\.html/);
  assert.equal(h.component('07-road-test.html').renderVals().hasEnded, false);
});

test('Review opens the exact error occurrence from timeline or list without changing saved evidence', () => {
  const h = harness();
  let record = h.model.write(h.model.create());
  h.advance(90000);
  const first = h.model.makeLines(record, [h.model.elements[0]], 'First occurrence note');
  h.advance(2000);
  const second = h.model.makeLines(record, [h.model.elements[0]], 'Second occurrence note');
  record = h.model.write({ ...record, saved: first.concat(second) });
  h.model.write(h.model.end(record));
  const c = h.component('08-review-and-submit.html');
  let view = c.renderVals();
  const before = h.storage.get(record.testKey);
  assert.equal(view.showErrorDetails, false);
  assert.equal(view.rows.find((row) => row.kind === 'scored').openDetails, undefined);
  view.markers.find((marker) => marker.id === first[0].id).openDetails();
  view = c.renderVals();
  assert.equal(view.showErrorDetails, true);
  assert.equal(view.errorDetails.label, first[0].label);
  assert.equal(view.errorDetails.points, 4);
  assert.equal(view.errorDetails.elapsed, '01:30');
  assert.equal(view.errorDetails.note, 'First occurrence note');
  assert.equal(view.errorDetails.location, '33.4884, -112.1494 (simulated GPS)');
  assert.match(view.errorDetails.timestamp, /\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}:\d{2} [AP]M/);
  view.closeErrorDetails();
  assert.equal(c.renderVals().showErrorDetails, false);
  c.renderVals().rows.find((row) => row.id === second[0].id).openDetails();
  assert.equal(c.renderVals().errorDetails.note, 'Second occurrence note');
  assert.equal(c.renderVals().errorDetails.elapsed, '01:32');
  c.renderVals().closeErrorDetails();
  assert.equal(h.storage.get(record.testKey), before, 'Viewing details must not save or modify the test');
  const errors = h.model.reviewData(h.model.read()).markers.filter((entry) => entry.kind === 'error');
  assert.ok(Math.abs(errors[0].top - errors[1].top) >= 44, 'Adjacent interactive error markers must have separate touch targets');
  c.renderVals().submitTest();
  assert.equal(h.model.read(), null, 'Expanding errors must preserve discard-on-submit behavior');
});

test('error details show absent legacy metadata and notes explicitly instead of fabricating details', () => {
  const h = harness();
  const record = h.model.create();
  const error = {
    ...h.model.makeLines(record, [h.model.elements[0]], '')[0],
    legacy: true, savedAt: null, points: null, location: null
  };
  h.model.write(h.model.end({ ...record, saved: [error] }));
  const c = h.component('08-review-and-submit.html');
  c.renderVals().rows.find((row) => row.isError).openDetails();
  const details = c.renderVals().errorDetails;
  assert.equal(details.points, 'Not captured');
  assert.equal(details.elapsed, 'Not captured');
  assert.equal(details.timestamp, 'Not captured');
  assert.equal(details.location, 'Not captured');
  assert.equal(details.note, 'No note recorded.');
});
