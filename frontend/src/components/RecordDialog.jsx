import React, { useEffect, useMemo, useRef, useState } from 'react';

const humanize = (key) => String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().replace(/^./, (letter) => letter.toUpperCase());

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: '1px solid #cdd9e8', background: '#fff', color: '#16243a', fontSize: 13.5, fontFamily: 'inherit' };
const buttonStyle = (background, color, border) => ({ border: border || 0, background, color, borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit' });

function Value({ value }) {
  if (value === null || value === undefined || value === '') return <span style={{ color: '#6b7d94' }}>Not provided</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (Array.isArray(value)) return value.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{value.map((item, index) => <li key={index}><Value value={item} /></li>)}</ul> : <span style={{ color: '#6b7d94' }}>None</span>;
  if (typeof value === 'object') return <dl style={{ margin: 0 }}>{Object.entries(value).map(([key, item]) => <div key={key}><dt style={{ fontWeight: 650 }}>{humanize(key)}</dt><dd style={{ margin: 0 }}><Value value={item} /></dd></div>)}</dl>;
  return <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(value)}</span>;
}

/**
 * RowDetails / RecordDialog — row click opens this dialog showing every field
 * with Edit, Delete (with confirmation) and Cancel controls. Portable: inline
 * styles only, no UI-library dependency. Escape closes the dialog; the table
 * row handles Enter/Space to open it.
 */
export default function RecordDialog({ title, item, fields, onClose, onSave, onDelete, deleteLabel = 'Delete', deleteWarning = 'This action cannot be undone.', busy = false, error = '', permissionsNote = '' }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState(() => ({ ...item }));
  const dialog = useRef(null);
  const specs = useMemo(() => (fields && fields.length ? fields : Object.keys(item || {}).map((key) => ({ key }))).map((spec) => (typeof spec === 'string' ? { key: spec } : spec)), [fields, item]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div className="modalBackdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(6,17,34,.66)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="recordDialog" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '86vh', overflow: 'auto', boxShadow: '0 30px 60px rgba(3,12,27,.4)', outline: 'none' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: '1px solid #e4ebf4' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#4b6b96' }}>{editing ? 'Edit record' : 'Record details'}</span>
            <h3 style={{ margin: '6px 0 0', fontSize: 18 }}>{title}</h3>
          </div>
          <button type="button" aria-label="Close record dialog" disabled={busy} onClick={onClose} style={{ border: '1px solid #cdd9e8', background: '#fff', borderRadius: 9, width: 34, height: 34, cursor: 'pointer', fontSize: 16 }}>×</button>
        </header>
        <div style={{ padding: '18px 20px', display: 'grid', gap: 12 }}>
          {specs.map((spec) => {
            const label = spec.label || humanize(spec.key);
            if (editing && spec.editable !== false) {
              const value = form[spec.key] ?? '';
              const set = (next) => setForm((current) => ({ ...current, [spec.key]: next }));
              return (
                <label key={spec.key} style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 650, color: '#243a5e' }}>{label}</span>
                  {spec.type === 'textarea'
                    ? <textarea rows={3} value={value} disabled={busy} onChange={(event) => set(event.target.value)} style={inputStyle} />
                    : spec.type === 'select'
                      ? <select value={value} disabled={busy} onChange={(event) => set(event.target.value)} style={inputStyle}>{(spec.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
                      : spec.type === 'boolean'
                        ? <select value={value ? 'true' : 'false'} disabled={busy} onChange={(event) => set(event.target.value === 'true')} style={inputStyle}><option value="false">No</option><option value="true">Yes</option></select>
                        : <input type={spec.type === 'number' ? 'number' : spec.type === 'date' ? 'date' : 'text'} step={spec.step} min={spec.min} max={spec.max} value={value} disabled={busy} onChange={(event) => set(event.target.value)} style={inputStyle} />}
                </label>
              );
            }
            return (
              <div key={spec.key} style={{ borderBottom: '1px solid #eef3f9', paddingBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#42608c', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13.5, color: '#1d2c44' }}><Value value={item[spec.key]} /></div>
              </div>
            );
          })}
          {error && <p role="alert" style={{ color: '#8f3d20', margin: 0 }}>{error}</p>}
          {confirm && <div role="alert" style={{ border: '1px solid #f2c9b8', background: '#fff3ec', borderRadius: 10, padding: '12px 14px' }}><strong>{deleteLabel} this record?</strong><p style={{ margin: '6px 0 0' }}>{deleteWarning}</p></div>}
          {permissionsNote && !editing && <p style={{ color: '#6b7d94', fontSize: 12.5, margin: 0 }}>{permissionsNote}</p>}
        </div>
        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid #e4ebf4' }}>
          {confirm ? (
            <>
              <button type="button" disabled={busy} onClick={() => setConfirm(false)} style={buttonStyle('#eef3f9', '#25364d')}>Cancel deletion</button>
              <button type="button" disabled={busy} onClick={() => onDelete(form)} style={buttonStyle('#b42318', '#fff')}>{busy ? 'Deleting…' : `Confirm ${deleteLabel.toLowerCase()}`}</button>
            </>
          ) : editing ? (
            <>
              <button type="button" disabled={busy} onClick={() => { setForm({ ...item }); setEditing(false); }} style={buttonStyle('#eef3f9', '#25364d')}>Cancel</button>
              <button type="button" disabled={busy || !onSave} onClick={() => onSave(form)} style={buttonStyle('#255e49', '#fff')}>{busy ? 'Saving…' : 'Save changes'}</button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={onClose} style={buttonStyle('#eef3f9', '#25364d')}>Cancel</button>
              <button type="button" disabled={busy || !onDelete} title={onDelete ? undefined : 'This record is retained by the audit trail'} onClick={() => setConfirm(true)} style={{ ...buttonStyle('#fde8e2', '#8f3d20'), opacity: onDelete ? 1 : .55 }}>{deleteLabel}</button>
              <button type="button" disabled={busy || !onSave} title={onSave ? undefined : 'This record cannot be edited'} onClick={() => { setForm({ ...item }); setConfirm(false); setEditing(true); }} style={{ ...buttonStyle('#fff', '#25364d', '1px solid #cdd9e8'), opacity: onSave ? 1 : .55 }}>Edit</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
