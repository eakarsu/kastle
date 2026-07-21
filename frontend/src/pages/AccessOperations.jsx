import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const initialRule = { propertyId: '', name: '', doorPattern: '*', action: 'DENY', priority: 50, days: [0,1,2,3,4,5,6], startTime: '00:00', endTime: '00:00', enabled: true };
const initialCredential = { propertyId: '', holderName: '', badgeNumber: '', credentialType: 'CARD', accessLevel: 'Standard', expiresOn: '' };

function dateTime(value) { return value ? new Date(value).toLocaleString() : '—'; }

export default function AccessOperations({ user }) {
  const [properties, setProperties] = useState([]);
  const [rules, setRules] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [readers, setReaders] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [rule, setRule] = useState(initialRule);
  const [credential, setCredential] = useState(initialCredential);
  const [reader, setReader] = useState({ propertyId: '', name: '' });
  const [readerKey, setReaderKey] = useState(null);
  const isAdmin = user?.role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      setError('');
      const [propertyData, ruleData, credentialData, attemptData, readerData, auditData] = await Promise.all([
        api('/properties'), api('/rules'), api('/credentials'), api('/access/attempts?limit=100'),
        isAdmin ? api('/readers') : Promise.resolve({ readers: [] }),
        user?.role === 'ADMIN' || user?.role === 'AUDITOR' ? api('/audit/verify') : Promise.resolve(null),
      ]);
      setProperties(propertyData.properties); setRules(ruleData.rules); setCredentials(credentialData.credentials); setAttempts(attemptData.attempts);
      if (readerData?.readers) setReaders(readerData.readers);
      if (auditData?.valid !== undefined) setAudit(auditData);
    } catch (failure) { setError(failure.message); }
  }, [isAdmin, user?.role]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const summary = useMemo(() => attempts.reduce((acc, attempt) => { acc.total += 1; acc[attempt.decision.toLowerCase()] += 1; return acc; }, { total: 0, allow: 0, deny: 0 }), [attempts]);
  const run = async (operation, message) => {
    try { setError(''); setNotice(''); await operation(); setNotice(message); await load(); }
    catch (failure) { setError(failure.message); }
  };

  async function createProperty(event) {
    event.preventDefault();
    await run(() => api('/properties', { method: 'POST', body: JSON.stringify({ name: propertyName, timezone: 'UTC' }) }), 'Property created.');
    setPropertyName('');
  }
  async function createCredential(event) {
    event.preventDefault();
    await run(() => api('/credentials', { method: 'POST', body: JSON.stringify(credential) }), 'Credential provisioned.');
    setCredential(initialCredential);
  }
  async function createRule(event) {
    event.preventDefault();
    await run(() => api('/rules', { method: 'POST', body: JSON.stringify(rule) }), 'Access rule published with an immutable version snapshot.');
    setRule(initialRule);
  }
  async function createReader(event) {
    event.preventDefault();
    try {
      setError('');
      const result = await api('/readers', { method: 'POST', body: JSON.stringify(reader) });
      setReaderKey({ id: result.id, key: result.apiKey });
      setReader({ propertyId: '', name: '' });
      await load();
    } catch (failure) { setError(failure.message); }
  }

  return <div className="access-page">
    <section className="hero"><div><p className="eyebrow">Physical access decisioning</p><h1>Authorization operations</h1><p>Every reader request is idempotent, evaluated against persisted rules, and written to an immutable tenant audit chain.</p></div><button className="btn btn-outline" onClick={load}>Refresh</button></section>
    {error && <div className="banner error" role="alert">{error}</div>}{notice && <div className="banner success" role="status">{notice}</div>}
    <section className="kpi-grid"><article><span>Attempts</span><strong>{summary.total}</strong></article><article><span>Allowed</span><strong className="allow">{summary.allow}</strong></article><article><span>Denied</span><strong className="deny">{summary.deny}</strong></article><article><span>Audit chain</span><strong className={audit?.valid ? 'allow' : ''}>{audit ? (audit.valid ? `Valid · ${audit.count}` : 'Invalid') : 'Role restricted'}</strong></article></section>

    {readerKey && <section className="secret-panel"><h2>Reader key issued once</h2><p>Store this key in the reader’s secret manager. Kastle retained only its digest.</p><dl><dt>Reader ID</dt><dd><code>{readerKey.id}</code></dd><dt>Reader key</dt><dd><code>{readerKey.key}</code></dd></dl><button className="btn btn-outline" onClick={() => setReaderKey(null)}>I stored it securely</button></section>}

    {isAdmin && <section className="admin-grid">
      <form className="panel" onSubmit={createProperty}><h2>1. Property</h2><label>Name<input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} minLength={2} required /></label><button className="btn btn-primary">Create property</button></form>
      <form className="panel" onSubmit={createCredential}><h2>2. Credential</h2><label>Property<select value={credential.propertyId} onChange={(e) => setCredential({ ...credential, propertyId: e.target.value })} required><option value="">Select</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Holder<input value={credential.holderName} onChange={(e) => setCredential({ ...credential, holderName: e.target.value })} required /></label><label>Badge number<input value={credential.badgeNumber} onChange={(e) => setCredential({ ...credential, badgeNumber: e.target.value })} required /></label><label>Expires on<input type="date" value={credential.expiresOn} onChange={(e) => setCredential({ ...credential, expiresOn: e.target.value })} required /></label><button className="btn btn-primary">Provision credential</button></form>
      <form className="panel" onSubmit={createRule}><h2>3. Rule</h2><label>Property<select value={rule.propertyId} onChange={(e) => setRule({ ...rule, propertyId: e.target.value })} required><option value="">Select</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Name<input value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} required /></label><label>Door (or *)<input value={rule.doorPattern} onChange={(e) => setRule({ ...rule, doorPattern: e.target.value })} required /></label><label>Action<select value={rule.action} onChange={(e) => setRule({ ...rule, action: e.target.value })}><option>DENY</option><option>ALLOW</option><option>REQUIRE_MFA</option></select></label><label>Priority<input type="number" min="1" max="100" value={rule.priority} onChange={(e) => setRule({ ...rule, priority: Number(e.target.value) })} /></label><div className="inline"><label>Start<input type="time" value={rule.startTime} onChange={(e) => setRule({ ...rule, startTime: e.target.value })} /></label><label>End<input type="time" value={rule.endTime} onChange={(e) => setRule({ ...rule, endTime: e.target.value })} /></label></div><button className="btn btn-primary">Publish rule</button></form>
      <form className="panel" onSubmit={createReader}><h2>4. Reader</h2><label>Property<select value={reader.propertyId} onChange={(e) => setReader({ ...reader, propertyId: e.target.value })} required><option value="">Select</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Reader name<input value={reader.name} onChange={(e) => setReader({ ...reader, name: e.target.value })} required /></label><button className="btn btn-primary">Issue reader key</button></form>
    </section>}

    <section className="panel table-panel"><h2>Published rules</h2><div className="table-wrap"><table><thead><tr><th>Rule</th><th>Door</th><th>Action</th><th>Priority</th><th>Schedule UTC</th><th>Version</th><th>State</th></tr></thead><tbody>{rules.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.door_pattern}</td><td><span className={`pill ${item.action === 'ALLOW' ? 'allow' : 'deny'}`}>{item.action}</span></td><td>{item.priority}</td><td>{String(item.start_time).slice(0,5)}–{String(item.end_time).slice(0,5)}</td><td>{item.version}</td><td>{item.enabled ? 'Enabled' : 'Disabled'}</td></tr>)}</tbody></table></div>{!rules.length && <p className="empty">No rules exist. Default decision is deny.</p>}</section>
    <section className="panel table-panel"><h2>Immutable access decisions</h2><div className="table-wrap"><table><thead><tr><th>Occurred</th><th>Badge suffix</th><th>Door</th><th>Decision</th><th>Reason</th><th>Event ID</th></tr></thead><tbody>{attempts.map((item) => <tr key={item.id}><td>{dateTime(item.occurred_at)}</td><td>••••{item.badge_suffix}</td><td>{item.door_name}</td><td><span className={`pill ${item.decision.toLowerCase()}`}>{item.decision}</span></td><td>{item.reason_code}</td><td><code>{item.external_event_id}</code></td></tr>)}</tbody></table></div>{!attempts.length && <p className="empty">No reader attempts recorded yet.</p>}</section>
    {isAdmin && <section className="panel table-panel"><h2>Provisioned readers</h2><div className="table-wrap"><table><thead><tr><th>Name</th><th>ID</th><th>Status</th><th>Last seen</th></tr></thead><tbody>{readers.map((item) => <tr key={item.id}><td>{item.name}</td><td><code>{item.id}</code></td><td>{item.status}</td><td>{dateTime(item.last_seen_at)}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
