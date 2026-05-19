// Identity + access analytics — badge data, tailgating detection.
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// POST /api/identity-analytics/tailgating — flag potential tailgates.
// Heuristic: two badge events at the same reader within < 3s.
router.post('/tailgating', auth, async (req, res) => {
  try {
    const events = Array.isArray(req.body.events) ? req.body.events : [];
    if (!events.length) {
      const r = await pool.query("SELECT * FROM badge_events ORDER BY created_at DESC LIMIT 500").catch(() => ({ rows: [] }));
      events.push(...r.rows);
    }
    events.sort((a, b) => new Date(a.created_at || a.timestamp) - new Date(b.created_at || b.timestamp));
    const flags = [];
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1], cur = events[i];
      const dt = (new Date(cur.created_at || cur.timestamp) - new Date(prev.created_at || prev.timestamp)) / 1000;
      if (dt < 3 && prev.reader_id === cur.reader_id && prev.user_id !== cur.user_id) {
        flags.push({
          reader: prev.reader_id,
          first: prev.user_id,
          second: cur.user_id,
          gap_seconds: Number(dt.toFixed(2))
        });
      }
    }
    res.json({ checked: events.length, tailgates: flags });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/identity-analytics/access-patterns/:userId
router.get('/access-patterns/:userId', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT reader_id, COUNT(*) as visits FROM badge_events WHERE user_id = $1 GROUP BY reader_id ORDER BY visits DESC LIMIT 50',
      [req.params.userId]
    ).catch(() => ({ rows: [] }));
    res.json({ userId: req.params.userId, patterns: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/identity-analytics/peer-comparison/:userId
router.get('/peer-comparison/:userId', auth, async (req, res) => {
  try {
    const u = await pool.query("SELECT role FROM users WHERE id = $1", [req.params.userId]).catch(() => ({ rows: [] }));
    const role = u.rows[0]?.role;
    if (!role) return res.json({ userId: req.params.userId, note: 'role unknown' });
    const my = await pool.query("SELECT COUNT(*) as n FROM badge_events WHERE user_id = $1", [req.params.userId]).catch(() => ({ rows: [{ n: 0 }] }));
    const peers = await pool.query(
      "SELECT AVG(c.cnt)::float as avg FROM (SELECT COUNT(*) as cnt FROM badge_events e JOIN users u ON e.user_id = u.id WHERE u.role = $1 GROUP BY u.id) c",
      [role]
    ).catch(() => ({ rows: [{ avg: 0 }] }));
    res.json({ userId: req.params.userId, role, my: Number(my.rows[0].n), peerAvg: peers.rows[0].avg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
