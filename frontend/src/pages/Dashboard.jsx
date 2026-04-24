import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FaBrain, FaDesktop, FaBolt, FaShieldAlt, FaExclamationTriangle, FaVideo } from 'react-icons/fa';
import { fetchDashboard, fetchList } from '../api';
import { modules, aiFeatures } from '../modules';

const SEVERITY_COLORS = { Critical: '#BB0000', High: '#E76500', Medium: '#DF6E0C', Low: '#107E3E' };
const CAMERA_COLORS = { Online: '#107E3E', Offline: '#BB0000', Maintenance: '#DF6E0C' };

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentEvents, setRecentEvents] = useState([]);

  useEffect(() => {
    fetchDashboard().then(setStats).catch(console.error).finally(() => setLoading(false));
    fetchList('device_events').then(d => setRecentEvents(Array.isArray(d) ? d.slice(0, 5) : [])).catch(() => {});
  }, []);

  if (loading) return <div className="loading"><div className="spinner" />Loading dashboard...</div>;
  if (!stats) return <div className="loading">Failed to load dashboard</div>;

  const kpis = [
    { label: 'Properties', value: stats.properties, color: '#0070F2' },
    { label: 'Active Cameras', value: stats.camerasOnline, color: '#107E3E' },
    { label: 'Open Incidents', value: stats.openIncidents, color: '#BB0000' },
    { label: 'Access Events', value: stats.accessEvents, color: '#00D4AA' },
    { label: 'Guards On Duty', value: stats.guardsOnDuty, color: '#1B6B93' },
    { label: 'Visitors', value: stats.visitorsCheckedIn, color: '#E76500' },
  ];

  const incidentData = Object.entries(stats.incidentsBySeverity).map(([name, value]) => ({ name, value }));
  const accessData = [
    { name: 'Granted', value: stats.accessGranted },
    { name: 'Denied', value: stats.accessDenied },
  ];
  const cameraData = Object.entries(stats.camerasByStatus).map(([name, value]) => ({ name, value }));

  const moduleCounts = {
    properties: stats.properties,
    cameras: stats.cameras,
    incidents: stats.openIncidents,
    access_events: stats.accessEvents,
    guards: stats.guards,
    visitors: stats.visitors,
    tenants: stats.tenants,
    credentials: stats.credentials,
    work_orders: stats.workOrders,
    zones: stats.zones,
  };

  return (
    <div>
      <div className="kpi-row">
        {kpis.map(k => (
          <div className="kpi-card" key={k.label} style={{ borderLeftColor: k.color }}>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      <h3 className="section-title">Modules</h3>
      <div className="card-grid">
        {modules.map(mod => {
          const Icon = mod.icon;
          return (
            <Link to={`/module/${mod.key}`} className="module-card" key={mod.key}>
              <div className="card-icon" style={{ background: mod.color + '15', color: mod.color }}>
                <Icon />
              </div>
              <div className="card-title">{mod.name}</div>
              <div className="card-desc">{mod.description}</div>
              <div className="card-count" style={{ color: mod.color }}>{moduleCounts[mod.key] ?? '—'}</div>
            </Link>
          );
        })}
      </div>

      <h3 className="section-title">AI Intelligence</h3>
      <div className="card-grid">
        {aiFeatures.slice(0, 4).map(f => (
          <Link to="/ai" className="module-card" key={f.key}>
            <div className="card-icon" style={{ background: '#0070F215', fontSize: 24 }}>{f.icon}</div>
            <div className="card-title">{f.name}</div>
            <div className="card-desc">{f.description}</div>
          </Link>
        ))}
      </div>

      <h3 className="section-title">Real-Time Operations</h3>
      <div className="card-grid" style={{ marginBottom: 32 }}>
        <Link to="/soc" className="module-card">
          <div className="card-icon" style={{ background: '#BB000015', color: '#BB0000' }}>
            <FaDesktop />
          </div>
          <div className="card-title">SOC Dashboard</div>
          <div className="card-desc">Live security operations center with real-time event feed, camera grid, and AI threat analysis</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#107E3E', fontWeight: 600 }}>
            <FaBolt /> Live
          </div>
        </Link>
        <div className="module-card" style={{ cursor: 'default' }}>
          <div className="card-icon" style={{ background: '#E7650015', color: '#E76500' }}>
            <FaExclamationTriangle />
          </div>
          <div className="card-title">Recent Device Events</div>
          <div style={{ marginTop: 8 }}>
            {recentEvents.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>No device events yet. Visit SOC Dashboard to start the simulator.</div>}
            {recentEvents.map((e, i) => (
              <div key={e.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11, borderBottom: i < recentEvents.length - 1 ? '1px solid #f0f2f5' : 'none' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.severity === 'critical' ? '#BB0000' : e.severity === 'warning' ? '#E76500' : '#0070F2', flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: '#1B2838' }}>{e.event_type?.replace(/_/g, ' ')}</span>
                <span style={{ color: '#999', marginLeft: 'auto' }}>{e.device_name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 className="section-title">Analytics</h3>
      <div className="charts-row">
        <div className="chart-card">
          <h3>Incidents by Severity</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={incidentData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {incidentData.map(entry => (
                  <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || '#999'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Access Events</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={accessData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                <Cell fill="#107E3E" />
                <Cell fill="#BB0000" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Camera Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={cameraData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {cameraData.map(entry => (
                  <Cell key={entry.name} fill={CAMERA_COLORS[entry.name] || '#999'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
