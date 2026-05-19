// Vendor-agnostic device adapter SDK — register vendor mappings and translate.
const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();

// In-memory adapter registry. In production, persist to `device_adapters` table.
const adapters = new Map();

// POST /api/device-adapter/register — register a vendor adapter mapping.
router.post('/register', auth, (req, res) => {
  const { vendor, model, mapping } = req.body;
  if (!vendor || !mapping) return res.status(400).json({ error: 'vendor and mapping required' });
  const key = `${vendor}|${model || '*'}`;
  adapters.set(key, { vendor, model: model || '*', mapping });
  res.json({ ok: true, key });
});

router.get('/list', auth, (_req, res) => {
  res.json({ count: adapters.size, adapters: [...adapters.values()] });
});

// POST /api/device-adapter/translate — convert a vendor payload to the canonical model.
router.post('/translate', auth, (req, res) => {
  try {
    const { vendor, model, payload } = req.body;
    if (!vendor || !payload) return res.status(400).json({ error: 'vendor and payload required' });
    const adapter = adapters.get(`${vendor}|${model || '*'}`) || adapters.get(`${vendor}|*`);
    if (!adapter) return res.status(404).json({ error: 'no adapter for vendor/model' });
    const out = {};
    for (const [canonicalKey, vendorPath] of Object.entries(adapter.mapping || {})) {
      out[canonicalKey] = vendorPath.split('.').reduce((v, k) => (v == null ? v : v[k]), payload);
    }
    res.json({ canonical: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/device-adapter/test — round-trip test a mapping.
router.post('/test', auth, (req, res) => {
  const { mapping, payload } = req.body;
  if (!mapping || !payload) return res.status(400).json({ error: 'mapping and payload required' });
  const out = {};
  for (const [k, path] of Object.entries(mapping)) {
    out[k] = path.split('.').reduce((v, k2) => (v == null ? v : v[k2]), payload);
  }
  res.json({ canonical: out });
});

module.exports = router;
