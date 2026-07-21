function minuteOfDay(value) {
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function scheduleMatches(rule, occurredAt) {
  const day = occurredAt.getUTCDay();
  const previousDay = (day + 6) % 7;
  const minute = occurredAt.getUTCHours() * 60 + occurredAt.getUTCMinutes();
  const start = minuteOfDay(rule.start_time);
  const end = minuteOfDay(rule.end_time);
  const days = rule.days.map(Number);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start === end) return days.includes(day);
  if (start < end) return days.includes(day) && minute >= start && minute < end;
  return (days.includes(day) && minute >= start) || (days.includes(previousDay) && minute < end);
}

function doorMatches(pattern, doorName) {
  return pattern === '*' || pattern.localeCompare(doorName, undefined, { sensitivity: 'accent' }) === 0;
}

function snapshotRule(rule) {
  if (!rule) return null;
  return {
    id: rule.id,
    name: rule.name,
    action: rule.action,
    priority: Number(rule.priority),
    doorPattern: rule.door_pattern,
    days: rule.days.map(Number),
    startTime: rule.start_time,
    endTime: rule.end_time,
    version: Number(rule.version),
  };
}

function evaluateAccess({ credential, rules, doorName, occurredAt, mfaVerified, stale = false }) {
  if (stale) return { decision: 'DENY', reasonCode: 'STALE_EVENT', reasonDetail: 'Reader event is too old for live door authorization', rule: null };
  if (!credential) return { decision: 'DENY', reasonCode: 'UNKNOWN_CREDENTIAL', reasonDetail: 'Credential was not found', rule: null };
  if (credential.status !== 'ACTIVE') return { decision: 'DENY', reasonCode: 'CREDENTIAL_INACTIVE', reasonDetail: `Credential is ${credential.status.toLowerCase()}`, rule: null };
  const expiryDate = credential.expires_on instanceof Date
    ? credential.expires_on.toISOString().slice(0, 10)
    : String(credential.expires_on).slice(0, 10);
  const expiry = new Date(`${expiryDate}T23:59:59.999Z`);
  if (Number.isNaN(expiry.getTime()) || expiry < occurredAt) return { decision: 'DENY', reasonCode: 'CREDENTIAL_EXPIRED', reasonDetail: 'Credential is expired', rule: null };

  const matched = [...rules]
    .filter((rule) => rule.enabled && doorMatches(rule.door_pattern, doorName) && scheduleMatches(rule, occurredAt))
    .sort((left, right) => Number(right.priority) - Number(left.priority) || String(left.id).localeCompare(String(right.id)))[0];
  if (!matched) return { decision: 'DENY', reasonCode: 'NO_MATCHING_RULE', reasonDetail: 'No active access rule permits this door and time', rule: null };
  if (matched.action === 'DENY') return { decision: 'DENY', reasonCode: 'RULE_DENY', reasonDetail: `Denied by rule ${matched.name}`, rule: matched };
  if (matched.action === 'REQUIRE_MFA' && !mfaVerified) return { decision: 'DENY', reasonCode: 'MFA_REQUIRED', reasonDetail: `Rule ${matched.name} requires verified MFA`, rule: matched };
  return { decision: 'ALLOW', reasonCode: matched.action === 'REQUIRE_MFA' ? 'MFA_VERIFIED' : 'RULE_ALLOW', reasonDetail: `Allowed by rule ${matched.name}`, rule: matched };
}

module.exports = { evaluateAccess, scheduleMatches, snapshotRule };
