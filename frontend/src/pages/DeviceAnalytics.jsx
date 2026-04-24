import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  FaHeartbeat, FaMicrochip, FaThermometerHalf,
  FaExclamationTriangle, FaChartLine, FaServer
} from 'react-icons/fa';

const BG = '#0a0e17';
const CARD = '#111827';
const BORDER = '#1e293b';
const TEXT = '#e2e8f0';
const TEXT_DIM = '#94a3b8';
const PRIMARY = '#3b82f6';
const GREEN = '#22c55e';
const RED = '#ef4444';
const YELLOW = '#f59e0b';
const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#64748b'];

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('kastle_token')}` };
}

function healthColor(score) {
  if (score >= 80) return GREEN;
  if (score >= 60) return YELLOW;
  return RED;
}

function fmtDate(raw) {
  const d = new Date(raw);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PROPERTIES = [
  'One World Trade Center', 'Willis Tower', 'Salesforce Tower',
  'JPMorgan Chase Tower', 'Bank of America Plaza', 'US Bank Tower'
];

const TABS = ['Fleet Overview', 'Device Detail', 'Property View', 'Comparison', 'Alert Patterns'];

const cardStyle = {
  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
  padding: 20, flex: 1, minWidth: 180
};
const labelStyle = { color: TEXT_DIM, fontSize: 13, marginBottom: 4 };
const valueStyle = { color: TEXT, fontSize: 26, fontWeight: 700 };
const tabBtn = (active) => ({
  padding: '10px 20px', cursor: 'pointer', border: 'none', borderRadius: 8,
  fontWeight: 600, fontSize: 14, transition: 'all .2s',
  background: active ? PRIMARY : 'transparent',
  color: active ? '#fff' : TEXT_DIM
});
const spinnerStyle = {
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  padding: 60, color: TEXT_DIM, fontSize: 15
};

export default function DeviceAnalytics() {
  const [tab, setTab] = useState(0);
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [allDevices, setAllDevices] = useState([]);

  // Device Detail state
  const [selectedDevice, setSelectedDevice] = useState('');
  const [deviceMetrics, setDeviceMetrics] = useState(null);
  const [deviceHealth, setDeviceHealth] = useState(null);
  const [loadingDevice, setLoadingDevice] = useState(false);

  // Property View state
  const [selectedProperty, setSelectedProperty] = useState(PROPERTIES[0]);
  const [propertyData, setPropertyData] = useState(null);
  const [loadingProperty, setLoadingProperty] = useState(false);

  // Comparison state
  const [comparison, setComparison] = useState(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Alerts state
  const [alerts, setAlerts] = useState(null);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  /* ---------- Overview + device list fetch ---------- */
  useEffect(() => {
    setLoadingOverview(true);
    Promise.all([
      fetch('/api/analytics/overview', { headers: authHeaders() }).then(r => r.json()),
      fetch('/api/devices?limit=100', { headers: authHeaders() }).then(r => r.json()),
    ]).then(([ov, devs]) => {
      setOverview(ov);
      setAllDevices(Array.isArray(devs) ? devs : []);
      setLoadingOverview(false);
    }).catch(() => setLoadingOverview(false));
  }, []);

  /* ---------- Device Detail fetch ---------- */
  useEffect(() => {
    if (!selectedDevice) return;
    setLoadingDevice(true);
    Promise.all([
      fetch(`/api/analytics/device/${selectedDevice}/metrics`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`/api/analytics/device/${selectedDevice}/health`, { headers: authHeaders() }).then(r => r.json())
    ]).then(([m, h]) => {
      setDeviceMetrics(m.metrics || []);
      setDeviceHealth(h.health || []);
      setLoadingDevice(false);
    }).catch(() => setLoadingDevice(false));
  }, [selectedDevice]);

  /* ---------- Property fetch ---------- */
  useEffect(() => {
    if (tab !== 2) return;
    setLoadingProperty(true);
    fetch(`/api/analytics/property/${encodeURIComponent(selectedProperty)}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setPropertyData(d); setLoadingProperty(false); })
      .catch(() => setLoadingProperty(false));
  }, [tab, selectedProperty]);

  /* ---------- Comparison fetch ---------- */
  useEffect(() => {
    if (tab !== 3 || comparison) return;
    setLoadingComparison(true);
    fetch('/api/analytics/comparison', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setComparison(d.by_type || []); setLoadingComparison(false); })
      .catch(() => setLoadingComparison(false));
  }, [tab, comparison]);

  /* ---------- Alerts fetch ---------- */
  useEffect(() => {
    if (tab !== 4 || alerts) return;
    setLoadingAlerts(true);
    fetch('/api/analytics/alerts', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setAlerts(d); setLoadingAlerts(false); })
      .catch(() => setLoadingAlerts(false));
  }, [tab, alerts]);

  /* ---------- Helper: loading spinner ---------- */
  const Loader = () => <div style={spinnerStyle}>Loading...</div>;

  /* ---------- Stat card ---------- */
  const StatCard = ({ icon, label, value, color }) => (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: color || PRIMARY, fontSize: 18 }}>{icon}</span>
        <span style={labelStyle}>{label}</span>
      </div>
      <div style={{ ...valueStyle, color: color || TEXT }}>{value}</div>
    </div>
  );

  /* ============================================================
     RENDER
  ============================================================ */
  if (loadingOverview) return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      Loading analytics...
    </div>
  );

  const ov = overview || {};
  const fleetHealth = ov.fleet_health ?? 0;
  const fleetAvail = ov.fleet_availability ?? 0;
  const alertCount = ov.total_alerts_7d ?? 0;
  const attentionDevices = ov.attention_needed || [];

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '24px 32px', color: TEXT, fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ---- Overview Banner ---- */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, flex: 'none', minWidth: 220 }}>
          <FaHeartbeat style={{ fontSize: 36, color: healthColor(fleetHealth) }} />
          <div>
            <div style={labelStyle}>Fleet Health</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: healthColor(fleetHealth) }}>{fleetHealth}</div>
          </div>
        </div>
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, flex: 'none', minWidth: 200 }}>
          <FaServer style={{ fontSize: 28, color: PRIMARY }} />
          <div>
            <div style={labelStyle}>Availability</div>
            <div style={{ ...valueStyle, color: GREEN }}>{fleetAvail}%</div>
          </div>
        </div>
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, flex: 'none', minWidth: 200 }}>
          <FaExclamationTriangle style={{ fontSize: 28, color: YELLOW }} />
          <div>
            <div style={labelStyle}>Alerts (7d)</div>
            <div style={{ ...valueStyle, color: alertCount > 20 ? RED : YELLOW }}>{alertCount}</div>
          </div>
        </div>
      </div>

      {/* ---- Stats Row ---- */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard icon={<FaHeartbeat />} label="Fleet Health" value={fleetHealth} color={healthColor(fleetHealth)} />
        <StatCard icon={<FaMicrochip />} label="Avg CPU %" value={`${ov.avg_cpu ?? 0}%`} color={PRIMARY} />
        <StatCard icon={<FaThermometerHalf />} label="Avg Temperature" value={`${ov.avg_temperature ?? 0}\u00b0C`} color={YELLOW} />
        <StatCard icon={<FaExclamationTriangle />} label="Alert Count (7d)" value={alertCount} color={RED} />
      </div>

      {/* ---- Tabs ---- */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: CARD, borderRadius: 10, padding: 4, border: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={tabBtn(tab === i)}>{t}</button>
        ))}
      </div>

      {/* ==================== TAB 0: Fleet Overview ==================== */}
      {tab === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Health Trend */}
          <div style={{ ...cardStyle, flex: 'none' }}>
            <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>
              <FaChartLine style={{ marginRight: 8, color: PRIMARY }} />Alert Trend (7 Days)
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={(ov.alert_trend || []).map(d => ({ ...d, date: fmtDate(d.date) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="date" stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                <YAxis stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT }} />
                <Area type="monotone" dataKey="alerts" stroke={PRIMARY} fill={PRIMARY} fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Health by Type */}
          <div style={{ ...cardStyle, flex: 'none' }}>
            <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>Health by Device Type</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ov.by_type || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="device_type" stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                <YAxis stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT }} />
                <Bar dataKey="avg_health" radius={[6, 6, 0, 0]} name="Health">
                  {(ov.by_type || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Attention Needed */}
          <div style={{ ...cardStyle, flex: 'none' }}>
            <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>
              <FaExclamationTriangle style={{ marginRight: 8, color: YELLOW }} />Devices Needing Attention
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['Device', 'Type', 'Property', 'Health', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: TEXT_DIM, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attentionDevices.map((d, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '10px 12px' }}>{d.device_name}</td>
                      <td style={{ padding: '10px 12px', color: TEXT_DIM }}>{d.device_type}</td>
                      <td style={{ padding: '10px 12px', color: TEXT_DIM }}>{d.property_name}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ color: healthColor(d.health_score), fontWeight: 700 }}>{d.health_score}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TEXT_DIM }}>{d.alert_count} alerts</td>
                    </tr>
                  ))}
                  {attentionDevices.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: TEXT_DIM }}>No devices need attention</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 1: Device Detail ==================== */}
      {tab === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ ...cardStyle, flex: 'none' }}>
            <label style={{ ...labelStyle, marginRight: 12 }}>Select Device:</label>
            <select
              value={selectedDevice}
              onChange={e => setSelectedDevice(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 14, minWidth: 260 }}
            >
              <option value="">-- choose a device --</option>
              {allDevices.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.device_type})</option>
              ))}
            </select>
          </div>

          {loadingDevice && <Loader />}

          {!loadingDevice && selectedDevice && deviceMetrics && (
            <>
              {/* CPU / Memory */}
              <div style={{ ...cardStyle, flex: 'none' }}>
                <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>CPU & Memory</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={deviceMetrics.map(m => ({ ...m, ts: new Date(m.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis dataKey="ts" stroke={TEXT_DIM} tick={{ fontSize: 11 }} interval={Math.floor(deviceMetrics.length / 8)} />
                    <YAxis stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT }} />
                    <Legend />
                    <Line type="monotone" dataKey="cpu_usage" stroke={PRIMARY} strokeWidth={2} dot={false} name="CPU %" />
                    <Line type="monotone" dataKey="memory_usage" stroke={GREEN} strokeWidth={2} dot={false} name="Memory %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Temperature */}
              <div style={{ ...cardStyle, flex: 'none' }}>
                <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>Temperature</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={deviceMetrics.map(m => ({ ...m, ts: new Date(m.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis dataKey="ts" stroke={TEXT_DIM} tick={{ fontSize: 11 }} interval={Math.floor(deviceMetrics.length / 8)} />
                    <YAxis stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT }} />
                    <Line type="monotone" dataKey="temperature" stroke={YELLOW} strokeWidth={2} dot={false} name="Temp (\u00b0C)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Health Score */}
              {deviceHealth && (
                <div style={{ ...cardStyle, flex: 'none' }}>
                  <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>Health Score History</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={deviceHealth.map(h => ({ ...h, date: fmtDate(h.score_date) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                      <XAxis dataKey="date" stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT }} />
                      <Bar dataKey="health_score" radius={[6, 6, 0, 0]} name="Health Score">
                        {deviceHealth.map((h, i) => <Cell key={i} fill={healthColor(h.health_score)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {!loadingDevice && !selectedDevice && (
            <div style={spinnerStyle}>Select a device above to view detailed metrics.</div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: Property View ==================== */}
      {tab === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ ...cardStyle, flex: 'none' }}>
            <label style={{ ...labelStyle, marginRight: 12 }}>Select Property:</label>
            <select
              value={selectedProperty}
              onChange={e => setSelectedProperty(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 14, minWidth: 280 }}
            >
              {PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {loadingProperty && <Loader />}

          {!loadingProperty && propertyData && (
            <>
              {/* Aggregates */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <StatCard icon={<FaServer />} label="Total Devices" value={(propertyData.devices || []).length} color={PRIMARY} />
                <StatCard icon={<FaMicrochip />} label="Avg CPU" value={`${parseFloat(propertyData.aggregates?.avg_cpu || 0).toFixed(1)}%`} color={PRIMARY} />
                <StatCard icon={<FaThermometerHalf />} label="Avg Temp" value={`${parseFloat(propertyData.aggregates?.avg_temp || 0).toFixed(1)}\u00b0C`} color={YELLOW} />
                <StatCard icon={<FaExclamationTriangle />} label="Errors" value={propertyData.aggregates?.errors ?? 0} color={RED} />
              </div>

              {/* Device Grid */}
              <div style={{ ...cardStyle, flex: 'none' }}>
                <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>Device Health Grid</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                  {(propertyData.devices || []).map((d, i) => {
                    const h = Math.round(parseFloat(d.avg_health || 0));
                    return (
                      <div key={i} style={{
                        background: BG, borderRadius: 10, padding: 16,
                        borderLeft: `4px solid ${healthColor(h)}`
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{d.device_name}</div>
                        <div style={{ color: TEXT_DIM, fontSize: 12, marginBottom: 4 }}>{d.device_type}</div>
                        <div style={{ fontWeight: 700, fontSize: 22, color: healthColor(h) }}>{h}</div>
                        <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 4 }}>{d.alerts ?? 0} alerts &middot; {parseFloat(d.avg_avail || 0).toFixed(1)}% avail</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== TAB 3: Comparison ==================== */}
      {tab === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {loadingComparison && <Loader />}
          {!loadingComparison && comparison && (
            <div style={{ ...cardStyle, flex: 'none' }}>
              <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>Device Type Comparison</h3>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={comparison.map(c => ({ ...c, avg_health: Math.round(parseFloat(c.avg_health)), avg_cpu: Math.round(parseFloat(c.avg_cpu)), avg_temp: Math.round(parseFloat(c.avg_temp)) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="device_type" stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                  <YAxis stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT }} />
                  <Legend />
                  <Bar dataKey="avg_health" fill={GREEN} name="Health" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avg_cpu" fill={PRIMARY} name="CPU %" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avg_temp" fill={YELLOW} name="Temp (\u00b0C)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 4: Alert Patterns ==================== */}
      {tab === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {loadingAlerts && <Loader />}
          {!loadingAlerts && alerts && (
            <>
              {/* Alerts by Day */}
              <div style={{ ...cardStyle, flex: 'none' }}>
                <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>Alerts by Day</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={(alerts.by_day || []).map(d => ({ ...d, date: fmtDate(d.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis dataKey="date" stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                    <YAxis stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT }} />
                    <Bar dataKey="count" fill={RED} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Alerts by Device (horizontal) */}
              <div style={{ ...cardStyle, flex: 'none' }}>
                <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>Alerts by Device</h3>
                <ResponsiveContainer width="100%" height={Math.max(200, (alerts.by_device || []).length * 40)}>
                  <BarChart layout="vertical" data={alerts.by_device || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis type="number" stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                    <YAxis dataKey="device_name" type="category" width={140} stroke={TEXT_DIM} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT }} />
                    <Bar dataKey="count" fill={YELLOW} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Alerts by Type (Pie) */}
              <div style={{ ...cardStyle, flex: 'none' }}>
                <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>Alerts by Type</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={alerts.by_type || []}
                      dataKey="count"
                      nameKey="device_type"
                      cx="50%" cy="50%"
                      outerRadius={110}
                      label={({ device_type, percent }) => `${device_type} ${(percent * 100).toFixed(0)}%`}
                    >
                      {(alerts.by_type || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Timeline Table */}
              <div style={{ ...cardStyle, flex: 'none' }}>
                <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 16 }}>Alert Timeline</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                        {['Date', 'Device', 'Type', 'Property', 'Health', 'Alerts'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: TEXT_DIM, fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(alerts.timeline || []).map((a, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '10px 12px', color: TEXT_DIM, whiteSpace: 'nowrap' }}>{fmtDate(a.score_date)}</td>
                          <td style={{ padding: '10px 12px' }}>{a.device_name}</td>
                          <td style={{ padding: '10px 12px', color: TEXT_DIM }}>{a.device_type}</td>
                          <td style={{ padding: '10px 12px', color: TEXT_DIM }}>{a.property_name}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ color: healthColor(a.health_score), fontWeight: 700 }}>{a.health_score}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                              background: a.alert_count >= 4 ? RED : a.alert_count >= 2 ? YELLOW : PRIMARY,
                              color: '#fff'
                            }}>
                              {a.alert_count}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(alerts.timeline || []).length === 0 && (
                        <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: TEXT_DIM }}>No alerts recorded</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
