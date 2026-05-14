// Telemetry ingestion + anomaly detection pipeline.
// Buffers incoming telemetry rows in memory; runs a moving-window z-score
// detector. Replace the buffer with Kafka / Redis Streams for production.
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const WINDOW = 50;
const Z_THRESHOLD = 3;
const buffers = new Map(); // key = `${deviceId}|${metric}` -> number[]

function mean(arr) { return arr.reduce((s, x) => s + x, 0) / arr.length; }
function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

// POST /api/telemetry/ingest — push one or many telemetry records.
router.post('/ingest', auth, async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const anomalies = [];
    for (const it of items) {
      const { deviceId, metric, value, timestamp } = it;
      if (!deviceId || !metric || value == null) continue;
      const key = `${deviceId}|${metric}`;
      const buf = buffers.get(key) || [];
      const sigma = stdev(buf);
      const mu = mean(buf);
      const z = sigma > 0 ? (value - mu) / sigma : 0;
      buf.push(value);
      if (buf.length > WINDOW) buf.shift();
      buffers.set(key, buf);
      if (Math.abs(z) > Z_THRESHOLD && buf.length >= 10) {
        anomalies.push({ deviceId, metric, value, z: Number(z.toFixed(2)), at: timestamp || new Date().toISOString() });
        try {
          await pool.query(
            'INSERT INTO security_events (device_id, event_type, severity, description) VALUES ($1, $2, $3, $4)',
            [deviceId, 'telemetry_anomaly', Math.abs(z) > 5 ? 'High' : 'Medium', `${metric}=${value}, z=${z.toFixed(2)}`]
          );
        } catch { /* table may not exist; ignore */ }
      }
    }
    res.json({ accepted: items.length, anomalies });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/telemetry/buffers — peek the in-memory buffers.
router.get('/buffers', auth, (_req, res) => {
  const out = [];
  for (const [key, buf] of buffers.entries()) {
    out.push({ key, count: buf.length, mean: Number(mean(buf).toFixed(2)), stdev: Number(stdev(buf).toFixed(2)) });
  }
  res.json({ keys: out.length, buffers: out.slice(0, 50) });
});

module.exports = router;
