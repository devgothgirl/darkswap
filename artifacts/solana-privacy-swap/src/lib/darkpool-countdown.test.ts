import test from 'node:test';
import assert from 'node:assert/strict';
import { DARKPOOL_REVEAL_AT, getRevealCountdown } from './darkpool-countdown.ts';

test('reveal ends at fixed PST, not Pacific daylight time', () => {
  assert.equal(new Date(DARKPOOL_REVEAL_AT).toISOString(), '2026-10-12T21:00:00.000Z');
  assert.equal(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(DARKPOOL_REVEAL_AT), '14:00');
  assert.equal(getRevealCountdown(Date.parse('2026-10-12T13:00:00-07:00')).hours, 1);
});

test('countdown splits remaining time into days, hours, minutes and seconds', () => {
  assert.deepEqual(getRevealCountdown(DARKPOOL_REVEAL_AT - 93784000), {
    ended: false, days: 1, hours: 2, minutes: 3, seconds: 4,
  });
});

test('last partial second stays active and expiry never becomes negative', () => {
  assert.equal(getRevealCountdown(DARKPOOL_REVEAL_AT - 1).seconds, 1);
  for (const now of [DARKPOOL_REVEAL_AT, DARKPOOL_REVEAL_AT + 86400000]) {
    assert.deepEqual(getRevealCountdown(now), {
      ended: true, days: 0, hours: 0, minutes: 0, seconds: 0,
    });
  }
});
