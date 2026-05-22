import React, { useEffect, useState } from 'react';

function cellColor(val, max) {
  if (!val) return '#f5f7fa';
  const r = Math.min(1, val / Math.max(1, max));
  const hue = 220 - Math.round(r * 200);
  return `hsl(${hue}, 70%, ${Math.max(35, 70 - Math.round(r * 35))}%)`;
}

export default function DoorUsageHeatmap() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('kastle_token');
    fetch('/api/custom-views/door-heatmap', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div style={{ color: '#BB0000' }}>Heatmap error: {err}</div>;
  if (!data) return <div>Loading heatmap...</div>;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#1B2838' }}>Door Usage Heatmap</h3>
        <div style={{ fontSize: 12, color: '#5b738b' }}>
          {data.door_count} doors · max cell {data.max_cell}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f5f7fa' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Door</th>
              {data.dayparts.map((d) => (
                <th key={d} style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>{d}</th>
              ))}
              <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Denied</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.doors.map((d) => (
              <tr key={d.door}>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f2f5' }}>{d.door}</td>
                {d.cells.map((v, i) => (
                  <td key={i} style={{
                    padding: '6px 10px',
                    textAlign: 'center',
                    background: cellColor(v, data.max_cell),
                    color: v > data.max_cell * 0.5 ? '#fff' : '#1B2838',
                    borderBottom: '1px solid #f0f2f5',
                    minWidth: 80,
                  }}>{v || ''}</td>
                ))}
                <td style={{ padding: '6px 10px', textAlign: 'right', color: '#BB0000', borderBottom: '1px solid #f0f2f5' }}>{d.denied}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f0f2f5' }}>{d.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
