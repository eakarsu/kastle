import React, { useState } from 'react';

export default function AccessAuditPdf() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const generate = async () => {
    setLoading(true);
    setErr(null);
    try {
      const token = localStorage.getItem('kastle_token');
      const r = await fetch('/api/custom-views/audit-pdf', { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      setReport(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!report) return;
    const blob = new Blob([report.document], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = report.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#1B2838' }}>Access Audit PDF</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={generate}
            disabled={loading}
            style={{ background: '#0070F2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}
          >
            {loading ? 'Generating...' : 'Generate audit'}
          </button>
          {report && (
            <button
              onClick={download}
              style={{ background: '#107E3E', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}
            >
              Download
            </button>
          )}
        </div>
      </div>
      {err && <div style={{ color: '#BB0000', marginBottom: 8 }}>Error: {err}</div>}
      {report && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13, color: '#5b738b' }}>
            <span>Total: <b style={{ color: '#1B2838' }}>{report.summary.total}</b></span>
            <span>Granted: <b style={{ color: '#107E3E' }}>{report.summary.granted}</b></span>
            <span>Denied: <b style={{ color: '#BB0000' }}>{report.summary.denied}</b></span>
            <span>Properties: <b style={{ color: '#1B2838' }}>{report.summary.properties}</b></span>
          </div>
          <pre style={{
            background: '#f5f7fa',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            padding: 12,
            maxHeight: 360,
            overflow: 'auto',
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, monospace',
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}>{report.document}</pre>
        </>
      )}
      {!report && !loading && (
        <div style={{ color: '#5b738b', fontSize: 13 }}>Click "Generate audit" to compile the latest 200 access events into a downloadable report.</div>
      )}
    </div>
  );
}
