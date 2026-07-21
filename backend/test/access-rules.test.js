const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAccess, scheduleMatches } = require('../lib/access-rules');

const credential = { id: 'credential-1', holder_name: 'Case Owner', badge_number: 'BADGE-1', status: 'ACTIVE', access_level: 'Standard', expires_on: '2030-12-31', version: 1 };
const rule = (overrides = {}) => ({ id: 'rule-1', name: 'Business hours', action: 'ALLOW', priority: 50, door_pattern: '*', days: [1,2,3,4,5], start_time: '08:00:00', end_time: '18:00:00', enabled: true, version: 1, ...overrides });

test('same start and end represents an explicit 24-hour schedule', () => {
  assert.equal(scheduleMatches(rule({ days: [0], start_time: '00:00:00', end_time: '00:00:00' }), new Date('2026-07-19T23:59:00Z')), true);
});

test('overnight schedules carry into the following day', () => {
  const overnight = rule({ days: [1], start_time: '22:00:00', end_time: '06:00:00' });
  assert.equal(scheduleMatches(overnight, new Date('2026-07-21T02:00:00Z')), true);
  assert.equal(scheduleMatches(overnight, new Date('2026-07-21T07:00:00Z')), false);
});

test('higher-priority deny wins deterministically', () => {
  const result = evaluateAccess({ credential, doorName: 'Lobby', occurredAt: new Date('2026-07-20T12:00:00Z'), mfaVerified: false, rules: [
    rule({ id: 'allow', days: [1], door_pattern: 'Lobby', priority: 20 }),
    rule({ id: 'deny', name: 'Lockdown', days: [1], door_pattern: 'Lobby', action: 'DENY', priority: 90 }),
  ] });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'RULE_DENY');
  assert.equal(result.rule.id, 'deny');
});

test('MFA rules deny until verification is explicit', () => {
  const mfaRule = rule({ days: [1], action: 'REQUIRE_MFA', door_pattern: 'Server Room' });
  assert.equal(evaluateAccess({ credential, rules: [mfaRule], doorName: 'Server Room', occurredAt: new Date('2026-07-20T12:00:00Z'), mfaVerified: false }).reasonCode, 'MFA_REQUIRED');
  assert.equal(evaluateAccess({ credential, rules: [mfaRule], doorName: 'Server Room', occurredAt: new Date('2026-07-20T12:00:00Z'), mfaVerified: true }).decision, 'ALLOW');
});

test('unknown, inactive, expired, and unmatched credentials fail closed', () => {
  const when = new Date('2026-07-20T12:00:00Z');
  assert.equal(evaluateAccess({ credential: null, rules: [], doorName: 'Lobby', occurredAt: when }).reasonCode, 'UNKNOWN_CREDENTIAL');
  assert.equal(evaluateAccess({ credential: { ...credential, status: 'REVOKED' }, rules: [], doorName: 'Lobby', occurredAt: when }).reasonCode, 'CREDENTIAL_INACTIVE');
  assert.equal(evaluateAccess({ credential: { ...credential, expires_on: '2026-07-19' }, rules: [], doorName: 'Lobby', occurredAt: when }).reasonCode, 'CREDENTIAL_EXPIRED');
  assert.equal(evaluateAccess({ credential, rules: [], doorName: 'Lobby', occurredAt: when }).reasonCode, 'NO_MATCHING_RULE');
});

test('stale reader events always deny before credential and rule evaluation', () => {
  const result = evaluateAccess({
    credential,
    rules: [rule({ days: [1] })],
    doorName: 'Lobby',
    occurredAt: new Date('2026-07-20T12:00:00Z'),
    mfaVerified: true,
    stale: true,
  });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'STALE_EVENT');
});
