import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function AccessTimelineChart() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('kastle_token');
    fetch('/api/custom-views/timeline', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div style={{ color: '#BB0000' }}>Timeline error: {err}</div>;
  if (!data) return <div>Loading timeline...</div>;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#1B2838' }}>Access Event Timeline (24h)</h3>
        <div style={{ fontSize: 12, color: '#5b738b' }}>
          Total {data.totals.total} · Granted {data.totals.granted} · Denied {data.totals.denied} · Peak {data.peak_hour}
        </div>
      </div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data.buckets}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="granted" stackId="a" fill="#107E3E" name="Granted" />
            <Bar dataKey="denied" stackId="a" fill="#BB0000" name="Denied" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
