import test from 'node:test';
import assert from 'node:assert/strict';
import { createChallengeTracker } from '../src/analytics.js';

function tracker() {
  const events = [];
  return { events, challenge: createChallengeTracker((type, name) => events.push([type, name])) };
}

test('each challenge step is sent once per page load', () => {
  const { events, challenge } = tracker();
  challenge.started();
  challenge.started();
  challenge.targetMet();
  challenge.targetMet();
  challenge.submitted();
  challenge.submitted();
  assert.deepEqual(events, [
    ['event', 'challenge_start'],
    ['event', 'challenge_target_met'],
    ['event', 'challenge_submit'],
  ]);
});

test('a shared plan that already meets the target is not progress until the resident acts', () => {
  const { events, challenge } = tracker();
  challenge.targetMet();
  assert.deepEqual(events, []);
});

test('submitting without changes still counts the earlier steps so the funnel never inverts', () => {
  const { events, challenge } = tracker();
  challenge.submitted();
  assert.deepEqual(events.map(([, name]) => name), ['challenge_start', 'challenge_target_met', 'challenge_submit']);
});

test('missing or failing analytics never throws', () => {
  assert.doesNotThrow(() => createChallengeTracker().submitted());
  assert.doesNotThrow(() => createChallengeTracker(() => { throw new Error('blocked'); }).submitted());
});
