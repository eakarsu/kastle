# Audit Apply Notes — kastle

Source: `_AUDIT/reports/batch_10.md` § Skeletons #20 kastle

## Original audit recommendations

> Likely IoT/security. Components: Dashboard, DeviceRegistry, FirmwareManagement, NetworkTopology, SOCDashboard, etc. Routes: 0. AI: 0 endpoints.
> "Full IoT UI, zero API."
> Missing: Device CRUD, firmware updates, network queries, sensor data ingestion, alerts. No AI for anomaly detection, threat prediction, or pattern analysis.

## Implemented this pass

**None.** Skeleton with no backend routes — there is nothing to extend mechanically. Adding routes from scratch requires schema and architecture decisions (sensor ingest model, time-series store, alert taxonomy) that the audit lists as missing infrastructure rather than as discrete mechanical adds.

## Categorisation

- All NEEDS-SCHEMA / NEEDS-PRODUCT-DECISION: device registry data model, firmware version graph, time-series ingestion path, alert taxonomy, anomaly thresholds.

## Apply pass 3 (frontend)

LEFT-AS-IS. The audit's "skeleton, no backend" assessment was outdated by the time of pass 3 — the project now has a Node/Express monolith with ~15 inline `/api/ai/*` endpoints and a fully-wired Vite/React frontend.

- `frontend/src/App.jsx` registers `/ai`, `/soc`, `/devices`, `/firmware`, `/topology`, `/analytics`.
- `frontend/src/pages/AIInsights.jsx` is the central AI panel; it iterates `aiFeatures` from `modules.js` (14 features mapped to backend endpoints: `soc-copilot`, `incident-summarizer`, `anomaly-detection`, `visitor-risk`, `nl-reporting`, `compliance-report`, `predictive-maintenance`, `threat-assessment`, `access-pattern-analysis`, `smart-scheduling`, `device-health-advisor`, `firmware-risk-analyzer`, `network-health-diagnostics`, `device-copilot`).
- `frontend/src/api.js` `callAI()` attaches `Authorization: Bearer` from `localStorage.kastle_token`.
- Minor: backend also exposes `/api/ai/threat-analyzer` (a more compact SOC summary) which is not surfaced as a separate card; the broader `threat-assessment` feature is. Left alone — not a missing FE feature, just a product overlap.

No FE files modified. Idempotent.

## Apply pass 4 (mechanical backlog)

LEFT-AS-IS. By pass 3 the project had already saturated the AI surface — `backend/server.js` exposes 15 `/api/ai/*` routes (soc-copilot, incident-summarizer, anomaly-detection, visitor-risk, nl-reporting, compliance-report, predictive-maintenance, threat-assessment, access-pattern-analysis, smart-scheduling, device-health-advisor, firmware-risk-analyzer, network-health-diagnostics, device-copilot, threat-analyzer), and `frontend/src/pages/AIInsights.jsx` iterates 14 of them via `modules.js` with JWT bearer from `localStorage.kastle_token`. The original audit's flagged gaps (Device CRUD, firmware updates, network queries, sensor ingestion, alerts) all remain as NEEDS-SCHEMA / NEEDS-PRODUCT-DECISION (sensor ingest model, time-series store, alert taxonomy, anomaly thresholds) — non-mechanical. No files modified.
