// Custom Views — 4 endpoints (2 VIZ + 2 NON-VIZ) for the Access Views page.
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// ─── In-memory access rules store (CRUD) ────────────────────────
const accessRules = [
  { id: 1, name: 'After-hours Entry Block', door: 'Main Lobby Entrance', schedule: 'Weekdays 22:00-06:00', action: 'Deny', priority: 'High', enabled: true },
  { id: 2, name: 'Executive Floor Restriction', door: 'Executive Floor', schedule: 'Always', action: 'Require MFA', priority: 'Critical', enabled: true },
  { id: 3, name: 'Loading Dock Window', door: 'Loading Dock', schedule: 'Mon-Fri 06:00-18:00', action: 'Allow', priority: 'Medium', enabled: true },
  { id: 4, name: 'Server Room Lockdown', door: 'Server Room 4A', schedule: 'Always', action: 'Deny (Allowlist Only)', priority: 'Critical', enabled: true },
  { id: 5, name: 'Roof Access Audit', door: 'Roof Access', schedule: 'Always', action: 'Allow + Notify', priority: 'High', enabled: false },
];
let nextRuleId = accessRules.length + 1;

// ─── 1. VIZ — Access event timeline (24-hour buckets, granted vs denied) ───
router.get('/timeline', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT EXTRACT(HOUR FROM timestamp)::int AS hour,
              status, COUNT(*)::int AS count
       FROM access_events
       GROUP BY hour, status
       ORDER BY hour`
    ).catch(() => ({ rows: [] }));

    const buckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: String(h).padStart(2, '0') + ':00',
      granted: 0,
      denied: 0,
      total: 0,
    }));
    for (const row of r.rows) {
      const b = buckets[row.hour];
      if (!b) continue;
      if (row.status === 'Granted') b.granted += row.count;
      else if (row.status === 'Denied') b.denied += row.count;
      b.total += row.count;
    }
    const totals = buckets.reduce(
      (acc, b) => ({ granted: acc.granted + b.granted, denied: acc.denied + b.denied, total: acc.total + b.total }),
      { granted: 0, denied: 0, total: 0 }
    );
    const peak = buckets.reduce((m, b) => (b.total > m.total ? b : m), buckets[0]);
    res.json({ buckets, totals, peak_hour: peak.label, generated_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. VIZ — Door usage heatmap (door × day-part) ────────────────
router.get('/door-heatmap', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT door_name,
              EXTRACT(HOUR FROM timestamp)::int AS hour,
              status,
              COUNT(*)::int AS count
       FROM access_events
       WHERE door_name IS NOT NULL
       GROUP BY door_name, hour, status`
    ).catch(() => ({ rows: [] }));

    const dayparts = ['Night (00-06)', 'Morning (06-12)', 'Afternoon (12-18)', 'Evening (18-24)'];
    const partFor = (h) => (h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3);

    const doorMap = new Map();
    for (const row of r.rows) {
      const m = doorMap.get(row.door_name) || {
        door: row.door_name,
        cells: [0, 0, 0, 0],
        denied: 0,
        granted: 0,
        total: 0,
      };
      const p = partFor(row.hour);
      m.cells[p] += row.count;
      m.total += row.count;
      if (row.status === 'Denied') m.denied += row.count;
      else if (row.status === 'Granted') m.granted += row.count;
      doorMap.set(row.door_name, m);
    }
    const doors = [...doorMap.values()].sort((a, b) => b.total - a.total);
    const maxCell = doors.reduce((m, d) => Math.max(m, ...d.cells), 1);
    res.json({
      dayparts,
      doors,
      max_cell: maxCell,
      door_count: doors.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. NON-VIZ — Access audit PDF (PDF-ish text export) ─────────
router.get('/audit-pdf', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT property_name, person_name, badge_number, door_name, direction, status, method, timestamp
       FROM access_events
       ORDER BY timestamp DESC NULLS LAST
       LIMIT 200`
    ).catch(() => ({ rows: [] }));
    const rows = r.rows;
    const granted = rows.filter((e) => e.status === 'Granted').length;
    const denied = rows.filter((e) => e.status === 'Denied').length;
    const properties = [...new Set(rows.map((e) => e.property_name).filter(Boolean))];

    const lines = [];
    lines.push('KASTLE SECURITY — ACCESS AUDIT REPORT');
    lines.push('Generated: ' + new Date().toISOString());
    lines.push('Reviewer: ' + (req.user.full_name || req.user.email || 'admin'));
    lines.push('---------------------------------------------');
    lines.push(`Total events reviewed: ${rows.length}`);
    lines.push(`Granted: ${granted}    Denied: ${denied}`);
    lines.push(`Properties covered: ${properties.length}`);
    lines.push('');
    lines.push('PROPERTIES:');
    for (const p of properties) lines.push('  - ' + p);
    lines.push('');
    lines.push('EVENT LOG (most recent first):');
    for (const e of rows.slice(0, 50)) {
      const t = e.timestamp ? new Date(e.timestamp).toISOString().slice(0, 19).replace('T', ' ') : '(no ts)';
      lines.push(`  [${t}] ${e.status || '?'}  ${e.person_name || 'Unknown'} (${e.badge_number || '-'})  @ ${e.door_name || 'Unknown door'}  via ${e.method || 'Unknown'}  (${e.property_name || 'Unknown property'})`);
    }
    lines.push('');
    lines.push('END OF REPORT');

    const document = lines.join('\n');
    res.json({
      filename: `kastle_access_audit_${Date.now()}.txt`,
      mime: 'text/plain',
      summary: {
        total: rows.length,
        granted,
        denied,
        properties: properties.length,
      },
      document,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. NON-VIZ — Access rules editor (CRUD on in-memory store) ─
router.get('/rules', auth, (req, res) => {
  res.json({ rules: accessRules, count: accessRules.length });
});

router.post('/rules', auth, (req, res) => {
  const { name, door, schedule, action, priority, enabled } = req.body || {};
  if (!name || !door) return res.status(400).json({ error: 'name and door are required' });
  const rule = {
    id: nextRuleId++,
    name: String(name),
    door: String(door),
    schedule: schedule || 'Always',
    action: action || 'Allow',
    priority: priority || 'Medium',
    enabled: enabled !== false,
  };
  accessRules.push(rule);
  res.status(201).json(rule);
});

router.put('/rules/:id', auth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rule = accessRules.find((r) => r.id === id);
  if (!rule) return res.status(404).json({ error: 'rule not found' });
  for (const k of ['name', 'door', 'schedule', 'action', 'priority', 'enabled']) {
    if (k in (req.body || {})) rule[k] = req.body[k];
  }
  res.json(rule);
});

router.delete('/rules/:id', auth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = accessRules.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'rule not found' });
  const [removed] = accessRules.splice(idx, 1);
  res.json({ deleted: removed });
});

module.exports = router;
