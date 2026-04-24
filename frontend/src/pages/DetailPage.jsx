import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaEdit, FaSave, FaTimes, FaTrash } from 'react-icons/fa';
import { fetchOne, updateRecord, deleteRecord } from '../api';
import { getModule } from '../modules';

function StatusBadge({ value }) {
  if (value === null || value === undefined) return <span>—</span>;
  const str = String(value);
  const cls = str.toLowerCase().replace(/[\s/]+/g, '-');
  return <span className={`badge badge-${cls}`}>{str}</span>;
}

export default function DetailPage() {
  const { name, id } = useParams();
  const navigate = useNavigate();
  const mod = getModule(name);
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchOne(name, id)
      .then(data => { setRecord(data); setForm(data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [name, id]);

  if (!mod) return <div className="loading">Module not found</div>;
  if (loading) return <div className="loading"><div className="spinner" />Loading...</div>;
  if (!record) return <div className="loading">Record not found</div>;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateRecord(name, id, form);
      setRecord(updated);
      setEditing(false);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await deleteRecord(name, id);
      navigate(`/module/${name}`);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const formatValue = (field, value) => {
    if (value === null || value === undefined) return '—';
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    if (field.type === 'date' || field.type === 'datetime-local') {
      try { return new Date(value).toLocaleString(); } catch { return String(value); }
    }
    return String(value);
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate(`/module/${name}`)}>
            <FaArrowLeft /> Back
          </button>
          <h2>{record[mod.fields[0]?.name] || `Record #${id}`}</h2>
        </div>
        <div className="detail-actions">
          {editing ? (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => { setEditing(false); setForm(record); }}>
                <FaTimes /> Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                <FaSave /> {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
                <FaEdit /> Edit
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                <FaTrash /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-grid">
          {mod.fields.map(field => (
            <div
              className={`detail-field ${field.type === 'textarea' ? 'full-width' : ''}`}
              key={field.name}
            >
              <label>{field.label}</label>
              {editing ? (
                field.type === 'select' ? (
                  <select
                    className="form-group"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 14 }}
                    value={form[field.name] || ''}
                    onChange={e => setForm({ ...form, [field.name]: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 14, minHeight: 80 }}
                    value={form[field.name] || ''}
                    onChange={e => setForm({ ...form, [field.name]: e.target.value })}
                  />
                ) : (
                  <input
                    type={field.type}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 14 }}
                    value={form[field.name] || ''}
                    onChange={e => setForm({ ...form, [field.name]: e.target.value })}
                  />
                )
              ) : (
                <div className="value">
                  {['status', 'severity', 'priority'].includes(field.name) ? (
                    <StatusBadge value={record[field.name]} />
                  ) : (
                    formatValue(field, record[field.name])
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
