import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaPlus, FaSearch } from 'react-icons/fa';
import { fetchList, createRecord } from '../api';
import { getModule } from '../modules';

function StatusBadge({ value }) {
  if (value === null || value === undefined) return <span>—</span>;
  const str = String(value);
  const cls = str.toLowerCase().replace(/[\s/]+/g, '-');
  return <span className={`badge badge-${cls}`}>{str}</span>;
}

function CellValue({ col, value }) {
  if (value === null || value === undefined) return <span style={{ color: '#999' }}>—</span>;
  if (['status', 'severity', 'priority', 'direction'].includes(col)) return <StatusBadge value={value} />;
  if (col === 'photo_id_verified' || col === 'alarm_enabled') return <StatusBadge value={value ? 'Active' : 'Inactive'} />;
  if (col === 'timestamp' || col === 'check_in' || col === 'check_out') {
    try { return <span>{new Date(value).toLocaleString()}</span>; } catch { return <span>{String(value)}</span>; }
  }
  return <span>{String(value)}</span>;
}

export default function ModulePage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const mod = getModule(name);
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchList(name, search).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [name, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSearch(''); setShowCreate(false); }, [name]);

  if (!mod) return <div className="loading">Module not found</div>;

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createRecord(name, form);
      setShowCreate(false);
      setForm({});
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="table-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <FaSearch style={{ position: 'absolute', left: 10, top: 10, color: '#999', fontSize: 13 }} />
            <input
              className="search-input"
              style={{ paddingLeft: 32 }}
              placeholder={`Search ${mod.name.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span style={{ color: '#999', fontSize: 13 }}>{data.length} records</span>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm({}); setShowCreate(true); }}>
          <FaPlus /> New {mod.name.replace(/s$/, '')}
        </button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Loading...</div>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                {mod.columns.map(col => (
                  <th key={col}>{col.replace(/_/g, ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id} onClick={() => navigate(`/module/${name}/${row.id}`)}>
                  {mod.columns.map(col => (
                    <td key={col}><CellValue col={col} value={row[col]} /></td>
                  ))}
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={mod.columns.length} style={{ textAlign: 'center', padding: 40, color: '#999' }}>No records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New {mod.name.replace(/s$/, '')}</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreate}>
                <div className="form-grid">
                  {mod.fields.map(field => (
                    <div className={`form-group ${field.type === 'textarea' ? 'full-width' : ''}`} key={field.name}>
                      <label>{field.label}</label>
                      {field.type === 'select' ? (
                        <select value={form[field.name] || ''} onChange={e => setForm({ ...form, [field.name]: e.target.value })}>
                          <option value="">Select...</option>
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : field.type === 'textarea' ? (
                        <textarea value={form[field.name] || ''} onChange={e => setForm({ ...form, [field.name]: e.target.value })} />
                      ) : (
                        <input
                          type={field.type}
                          value={form[field.name] || ''}
                          onChange={e => setForm({ ...form, [field.name]: e.target.value })}
                          required={field.required}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
