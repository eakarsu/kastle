// Firmware CVE scanner with rollback playbooks.
// Queries the public NVD API. TODO: configure credentials — NVD_API_KEY (optional, raises rate limit).
const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../db');
const router = express.Router();

async function nvdSearch(keyword, results = 10) {
  const key = process.env.NVD_API_KEY;
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=${results}`;
  const headers = key ? { apiKey: key } : {};
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`NVD ${r.status}`);
  return r.json();
}

// POST /api/firmware-cve/scan — scan {vendor, product, version}.
router.post('/scan', auth, async (req, res) => {
  try {
    const { vendor, product, version } = req.body;
    if (!product) return res.status(400).json({ error: 'product required' });
    const query = [vendor, product, version].filter(Boolean).join(' ');
    const data = await nvdSearch(query).catch(e => ({ error: e.message }));
    if (data.error) return res.status(502).json(data);

    const findings = (data.vulnerabilities || []).map(v => {
      const cve = v.cve || {};
      const metrics = cve.metrics?.cvssMetricV31?.[0]?.cvssData || cve.metrics?.cvssMetricV30?.[0]?.cvssData || {};
      return {
        id: cve.id,
        published: cve.published,
        severity: metrics.baseSeverity,
        score: metrics.baseScore,
        description: (cve.descriptions?.[0]?.value || '').slice(0, 300),
        rollbackPlaybook: `1) Take device offline\n2) Restore previous firmware ${version || 'N-1'}\n3) Verify hash\n4) Re-enable monitoring`
      };
    });

    res.json({ query, findings, totalResults: data.totalResults || findings.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/firmware-cve/devices-at-risk — cross-references devices with NVD.
router.get('/devices-at-risk', auth, async (_req, res) => {
  try {
    const r = await pool.query('SELECT id, name, firmware_version, vendor FROM devices LIMIT 100').catch(() => ({ rows: [] }));
    const flagged = [];
    for (const d of r.rows.slice(0, 20)) {
      if (!d.vendor && !d.name) continue;
      try {
        const data = await nvdSearch(`${d.vendor || ''} ${d.name}`.trim(), 1);
        if ((data.totalResults || 0) > 0) flagged.push({ device: d, sampleCveCount: data.totalResults });
      } catch {}
    }
    res.json({ scanned: r.rows.length, flagged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
