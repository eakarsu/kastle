// SOC triage agent — auto-cluster alerts, summarize incidents.
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';

async function callAI(messages, maxTokens = 1500) {
  if (!OPENROUTER_API_KEY) {
    const e = new Error('OPENROUTER_API_KEY not configured'); e.statusCode = 503; throw e;
  }
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_tokens: maxTokens, temperature: 0.3 })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.choices[0].message.content;
}

function clusterAlerts(alerts) {
  const clusters = new Map();
  for (const a of alerts) {
    const key = `${a.event_type}|${a.severity}|${a.device_id || ''}`;
    const c = clusters.get(key) || { key, type: a.event_type, severity: a.severity, deviceId: a.device_id, members: [] };
    c.members.push(a);
    clusters.set(key, c);
  }
  return [...clusters.values()].sort((a, b) => b.members.length - a.members.length);
}

// POST /api/soc-triage/cluster — group recent alerts.
router.post('/cluster', auth, async (req, res) => {
  try {
    const limit = req.body.limit || 100;
    const r = await pool.query('SELECT * FROM security_events ORDER BY id DESC LIMIT $1', [limit]).catch(() => ({ rows: [] }));
    const clusters = clusterAlerts(r.rows);
    res.json({ totalAlerts: r.rows.length, clusters: clusters.slice(0, 20) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/soc-triage/summarize-incident — LLM summarises one cluster.
router.post('/summarize-incident', auth, async (req, res) => {
  try {
    const { cluster } = req.body;
    if (!cluster || !Array.isArray(cluster.members)) return res.status(400).json({ error: 'cluster.members[] required' });
    const lines = cluster.members.slice(0, 30).map(m => `[${m.severity}] ${m.event_type} ${m.description || ''}`).join('\n');
    const out = await callAI([
      { role: 'system', content: 'You are a SOC L2 analyst. Summarise the incident in 5 bullets and propose 3 immediate actions.' },
      { role: 'user', content: lines }
    ]);
    res.json({ summary: out, alertCount: cluster.members.length });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

module.exports = router;
