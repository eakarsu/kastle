import React, { useEffect, useState } from 'react';

const EMPTY = { name: '', door: '', schedule: 'Always', action: 'Allow', priority: 'Medium', enabled: true };

export default function AccessRulesEditor() {
  const [rules, setRules] = useState([]);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const token = () => localStorage.getItem('kastle_token');
  const authHeaders = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/custom-views/rules', { headers: { Authorization: `Bearer ${token()}` } });
      const d = await r.json();
      setRules(d.rules || []);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      if (editingId) {
        const r = await fetch(`/api/custom-views/rules/${editingId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(draft) });
        if (!r.ok) throw new Error((await r.json()).error || 'Update failed');
      } else {
        const r = await fetch('/api/custom-views/rules', { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });
        if (!r.ok) throw new Error((await r.json()).error || 'Create failed');
      }
      setDraft(EMPTY);
      setEditingId(null);
      load();
    } catch (e) { setErr(e.message); }
  };

  const startEdit = (rule) => { setDraft({ ...rule }); setEditingId(rule.id); };

  const cancel = () => { setDraft(EMPTY); setEditingId(null); };

  const remove = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      const r = await fetch(`/api/custom-views/rules/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error('Delete failed');
      load();
    } catch (e) { setErr(e.message); }
  };

  const input = (key, label, type = 'text') => (
    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#5b738b' }}>
      {label}
      <input
        type={type}
        value={draft[key] ?? ''}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        style={{ padding: '6px 8px', border: '1px solid #d0d7e0', borderRadius: 4, marginTop: 2 }}
      />
    </label>
  );

  const select = (key, label, opts) => (
    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#5b738b' }}>
      {label}
      <select
        value={draft[key] ?? opts[0]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        style={{ padding: '6px 8px', border: '1px solid #d0d7e0', borderRadius: 4, marginTop: 2 }}
      >
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#1B2838' }}>Access Rules Editor</h3>
        <div style={{ fontSize: 12, color: '#5b738b' }}>{rules.length} rule(s){loading ? ' · loading...' : ''}</div>
      </div>

      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14, padding: 12, background: '#f5f7fa', borderRadius: 6 }}>
        {input('name', 'Rule name')}
        {input('door', 'Door')}
        {input('schedule', 'Schedule')}
        {select('action', 'Action', ['Allow', 'Deny', 'Require MFA', 'Allow + Notify', 'Deny (Allowlist Only)'])}
        {select('priority', 'Priority', ['Low', 'Medium', 'High', 'Critical'])}
        <label style={{ display: 'flex', alignItems: 'end', gap: 8, fontSize: 12, color: '#5b738b' }}>
          <input type="checkbox" checked={!!draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
          Enabled
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
          <button type="submit" style={{ background: editingId ? '#E76500' : '#0070F2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}>
            {editingId ? 'Update rule' : 'Create rule'}
          </button>
          {editingId && (
            <button type="button" onClick={cancel} style={{ background: '#fff', color: '#1B2838', border: '1px solid #d0d7e0', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {err && <div style={{ color: '#BB0000', marginBottom: 8 }}>Error: {err}</div>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f5f7fa' }}>
            <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Door</th>
            <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Schedule</th>
            <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Action</th>
            <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Priority</th>
            <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Enabled</th>
            <th style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f2f5' }}>{r.name}</td>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f2f5' }}>{r.door}</td>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f2f5' }}>{r.schedule}</td>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f2f5' }}>{r.action}</td>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f2f5' }}>{r.priority}</td>
              <td style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #f0f2f5' }}>{r.enabled ? 'Yes' : 'No'}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #f0f2f5' }}>
                <button onClick={() => startEdit(r)} style={{ background: '#fff', border: '1px solid #d0d7e0', borderRadius: 4, padding: '4px 10px', marginRight: 6, cursor: 'pointer' }}>Edit</button>
                <button onClick={() => remove(r.id)} style={{ background: '#BB0000', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
