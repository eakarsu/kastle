import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaMicrochip, FaCheck, FaExclamationTriangle, FaClock, FaSync, FaDownload, FaShieldAlt, FaTimes } from 'react-icons/fa';
import io from 'socket.io-client';

const BG = '#0a0e17';
const CARD = '#111827';
const BORDER = '#1e293b';
const TEXT = '#e2e8f0';
const TEXT_DIM = '#94a3b8';
const PRIMARY = '#3b82f6';
const GREEN = '#22c55e';
const RED = '#ef4444';
const YELLOW = '#f59e0b';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('kastle_token')}` };
}

const severityConfig = {
  current:     { label: 'Current',     bg: GREEN + '22', color: GREEN,   border: GREEN },
  critical:    { label: 'Critical',    bg: RED + '22',   color: RED,     border: RED },
  recommended: { label: 'Recommended', bg: YELLOW + '22', color: YELLOW, border: YELLOW },
  optional:    { label: 'Optional',    bg: '#64748b22',  color: '#94a3b8', border: '#64748b' },
};

const statusConfig = {
  completed:  { label: 'Completed',  color: GREEN },
  failed:     { label: 'Failed',     color: RED },
  scheduled:  { label: 'Scheduled',  color: YELLOW },
  cancelled:  { label: 'Cancelled',  color: TEXT_DIM },
  downloading:{ label: 'Downloading', color: PRIMARY },
  installing: { label: 'Installing',  color: PRIMARY },
};

function Badge({ severity }) {
  const cfg = severityConfig[severity] || severityConfig.optional;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || { label: status, color: TEXT_DIM };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}` }}>
      {cfg.label}
    </span>
  );
}

function ProgressBar({ progress, status }) {
  const label = status === 'downloading' ? 'Downloading' : 'Installing';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: BORDER }}>
        <div style={{ width: `${progress || 0}%`, height: '100%', borderRadius: 4,
          background: `linear-gradient(90deg, ${PRIMARY}, ${GREEN})`, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 12, color: TEXT_DIM, whiteSpace: 'nowrap' }}>
        {label} {progress || 0}%
      </span>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: color + '18', color }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: TEXT }}>{value}</div>
        <div style={{ fontSize: 13, color: TEXT_DIM }}>{label}</div>
      </div>
    </div>
  );
}

export default function FirmwareManagement() {
  const [tab, setTab] = useState('status');
  const [compliance, setCompliance] = useState(null);
  const [devices, setDevices] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initiating, setInitiating] = useState({});
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedUpdate, setSelectedUpdate] = useState(null);
  const socketRef = useRef(null);
  const refreshTimerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [compRes, devRes, updRes] = await Promise.all([
        fetch('/api/firmware/compliance', { headers: authHeaders() }),
        fetch('/api/firmware/device-status', { headers: authHeaders() }),
        fetch('/api/firmware_updates?limit=100&order=desc', { headers: authHeaders() }),
      ]);
      if (!compRes.ok || !devRes.ok || !updRes.ok) throw new Error('Failed to fetch firmware data');
      const [compData, devData, updData] = await Promise.all([
        compRes.json(), devRes.json(), updRes.json(),
      ]);
      setCompliance(compData);
      setDevices(devData.devices || []);
      setUpdates(Array.isArray(updData) ? updData : updData.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Socket.IO for realtime firmware progress
  useEffect(() => {
    const socket = io({ auth: { token: localStorage.getItem('kastle_token') } });
    socketRef.current = socket;

    socket.on('firmware-progress', (payload) => {
      setUpdates(prev => prev.map(u =>
        u.id === payload.id ? { ...u, progress: payload.progress, status: payload.status } : u
      ));
    });

    socket.on('firmware-complete', (payload) => {
      setUpdates(prev => prev.map(u =>
        u.id === payload.id ? { ...u, status: payload.status, progress: 100,
          completed_at: payload.completed_at, error_message: payload.error_message } : u
      ));
      fetchAll();
    });

    return () => { socket.disconnect(); };
  }, [fetchAll]);

  // Auto-refresh every 5s when there are active updates
  useEffect(() => {
    const hasActive = updates.some(u => u.status === 'downloading' || u.status === 'installing');
    if (hasActive && tab === 'history') {
      refreshTimerRef.current = setInterval(fetchAll, 5000);
    }
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [updates, tab, fetchAll]);

  async function initiateUpdate(device) {
    setInitiating(prev => ({ ...prev, [device.id]: true }));
    try {
      const res = await fetch('/api/firmware/initiate', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: device.id,
          device_name: device.device_name,
          property_name: device.property_name,
          current_version: device.current_version,
          target_version: device.latest_version,
        }),
      });
      if (!res.ok) throw new Error('Failed to initiate update');
      await fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setInitiating(prev => ({ ...prev, [device.id]: false }));
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: TEXT }}>
        <div style={{ textAlign: 'center' }}>
          <FaSync style={{ fontSize: 32, animation: 'spin 1s linear infinite', color: PRIMARY }} />
          <div style={{ marginTop: 16, fontSize: 16, color: TEXT_DIM }}>Loading firmware data...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error && !compliance) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: TEXT }}>
        <div style={{ textAlign: 'center', background: CARD, border: `1px solid ${RED}44`,
          borderRadius: 12, padding: 32, maxWidth: 420 }}>
          <FaExclamationTriangle style={{ fontSize: 32, color: RED }} />
          <div style={{ marginTop: 12, fontSize: 16, fontWeight: 600 }}>Error Loading Data</div>
          <div style={{ marginTop: 8, fontSize: 14, color: TEXT_DIM }}>{error}</div>
          <button onClick={() => { setLoading(true); setError(null); fetchAll(); }}
            style={{ marginTop: 20, padding: '8px 24px', background: PRIMARY, color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const pct = compliance?.compliance_pct || 0;
  const barColor = pct > 80 ? GREEN : pct > 60 ? YELLOW : RED;
  const totalCurrent = compliance?.total_current || 0;
  const totalDevices = compliance?.total_devices || 0;
  const outdatedCritical = devices.filter(d => d.severity === 'critical').length;
  const pendingCount = devices.filter(d => d.pending_update).length;
  const tabs = [
    { key: 'status', label: 'Device Status' },
    { key: 'history', label: 'Update History' },
    { key: 'compliance', label: 'Compliance by Property' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <FaMicrochip style={{ fontSize: 24, color: PRIMARY }} />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Firmware Management</h1>
        </div>
        <button onClick={() => { setLoading(true); fetchAll(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT,
            cursor: 'pointer', fontSize: 13 }}>
          <FaSync size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: RED + '18', border: `1px solid ${RED}44`, borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, fontSize: 13, color: RED }}>
          {error}
        </div>
      )}

      {/* Compliance Banner */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
        padding: '20px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FaShieldAlt style={{ color: barColor }} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {totalCurrent}/{totalDevices} devices current &mdash; {pct}% compliant
            </span>
          </div>
        </div>
        <div style={{ height: 10, borderRadius: 5, background: BORDER, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 5,
            background: `linear-gradient(90deg, ${barColor}cc, ${barColor})`, transition: 'width 0.6s ease' }} />
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <StatCard icon={<FaMicrochip size={20} />} label="Total Devices" value={totalDevices} color={PRIMARY} />
        <StatCard icon={<FaCheck size={20} />} label="Up-to-Date" value={totalCurrent} color={GREEN} />
        <StatCard icon={<FaExclamationTriangle size={20} />} label="Outdated (Critical)" value={outdatedCritical} color={RED} />
        <StatCard icon={<FaClock size={20} />} label="Pending Updates" value={pendingCount} color={YELLOW} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${BORDER}`, paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 20px', background: 'none', border: 'none',
              borderBottom: tab === t.key ? `2px solid ${PRIMARY}` : '2px solid transparent',
              color: tab === t.key ? TEXT : TEXT_DIM, fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Device Status Tab */}
      {tab === 'status' && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Device', 'Type', 'Property', 'Current Version', 'Latest Version', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12,
                    fontWeight: 600, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: TEXT_DIM }}>
                  No devices found
                </td></tr>
              )}
              {devices.map(d => {
                const sev = d.is_current ? 'current' : (d.severity || 'optional');
                return (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', transition: 'background 0.15s' }}
                    onClick={() => setSelectedRow(d)}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#ffffff06'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>{d.device_name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: TEXT_DIM }}>{d.device_type}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: TEXT_DIM }}>{d.property_name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'monospace' }}>{d.current_version}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'monospace' }}>{d.latest_version}</td>
                    <td style={{ padding: '12px 16px' }}><Badge severity={sev} /></td>
                    <td style={{ padding: '12px 16px' }}>
                      {!d.is_current && (
                        <button onClick={(e) => { e.stopPropagation(); initiateUpdate(d); }}
                          disabled={initiating[d.id] || d.pending_update}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                            background: d.pending_update ? BORDER : PRIMARY, color: '#fff', border: 'none',
                            borderRadius: 6, cursor: d.pending_update ? 'default' : 'pointer', fontSize: 12,
                            fontWeight: 500, opacity: initiating[d.id] ? 0.6 : 1 }}>
                          <FaDownload size={10} />
                          {d.pending_update ? 'Pending' : initiating[d.id] ? 'Starting...' : 'Update'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Update History Tab */}
      {tab === 'history' && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Device', 'Property', 'From', 'To', 'Status', 'Initiated By', 'Scheduled'].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12,
                    fontWeight: 600, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {updates.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: TEXT_DIM }}>
                  No update history found
                </td></tr>
              )}
              {updates.map(u => {
                const isActive = u.status === 'downloading' || u.status === 'installing';
                return (
                  <tr key={u.id} onClick={() => setSelectedUpdate(u)}
                    style={{ borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#ffffff06'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>{u.device_name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: TEXT_DIM }}>{u.property_name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'monospace' }}>{u.current_version}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'monospace' }}>{u.target_version}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {isActive
                        ? <ProgressBar progress={u.progress} status={u.status} />
                        : <StatusBadge status={u.status} />}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: TEXT_DIM }}>{u.initiated_by || '--'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: TEXT_DIM }}>
                      {u.scheduled_at ? new Date(u.scheduled_at).toLocaleString() : '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Update History Detail Popup */}
      {selectedUpdate && (() => {
        const u = selectedUpdate;
        const isActive = u.status === 'downloading' || u.status === 'installing';
        const statusCfg = statusConfig[u.status] || { label: u.status, color: TEXT_DIM };
        return (
          <div onClick={() => setSelectedUpdate(null)} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 32,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
              width: '100%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
              animation: 'modalIn 0.2s ease',
            }}>
              <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>

              {/* Header */}
              <div style={{ padding: '20px 28px', borderBottom: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
                background: `linear-gradient(135deg, ${statusCfg.color}15, transparent)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: statusCfg.color + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FaSync style={{ color: statusCfg.color, fontSize: 16 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>Firmware Update</div>
                    <div style={{ fontSize: 12, color: TEXT_DIM }}>{u.device_name} &middot; {u.property_name}</div>
                  </div>
                </div>
                <button onClick={() => setSelectedUpdate(null)} style={{
                  background: '#ffffff0a', border: `1px solid ${BORDER}`, borderRadius: 8,
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: TEXT_DIM, fontSize: 16,
                }}>
                  <FaTimes />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: 28, overflowY: 'auto', flex: 1 }}>
                {/* Status + Progress */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
                  background: BG, borderRadius: 12, padding: '16px 20px', border: `1px solid ${BORDER}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Status</div>
                    {isActive ? <ProgressBar progress={u.progress} status={u.status} /> : <StatusBadge status={u.status} />}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Progress</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: statusCfg.color }}>{u.progress}%</div>
                  </div>
                </div>

                {/* Version */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
                  background: BG, borderRadius: 12, padding: '16px 20px', border: `1px solid ${BORDER}` }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>From</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: RED }}>{u.current_version}</div>
                  </div>
                  <div style={{ fontSize: 20, color: TEXT_DIM }}>&#8594;</div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>To</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: GREEN }}>{u.target_version}</div>
                  </div>
                </div>

                {/* Details Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ background: BG, borderRadius: 10, padding: 14, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Initiated By</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{u.initiated_by || '--'}</div>
                  </div>
                  <div style={{ background: BG, borderRadius: 10, padding: 14, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Device ID</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>#{u.device_id}</div>
                  </div>
                  <div style={{ background: BG, borderRadius: 10, padding: 14, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Scheduled</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{u.scheduled_at ? new Date(u.scheduled_at).toLocaleString() : 'Not scheduled'}</div>
                  </div>
                  <div style={{ background: BG, borderRadius: 10, padding: 14, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Started</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{u.started_at ? new Date(u.started_at).toLocaleString() : 'Not started'}</div>
                  </div>
                  <div style={{ background: BG, borderRadius: 10, padding: 14, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Completed</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{u.completed_at ? new Date(u.completed_at).toLocaleString() : 'Not completed'}</div>
                  </div>
                  <div style={{ background: BG, borderRadius: 10, padding: 14, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Record ID</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>#{u.id}</div>
                  </div>
                </div>

                {/* Error Message */}
                {u.error_message && (
                  <div style={{ marginTop: 20, background: RED + '12', border: `1px solid ${RED}33`,
                    borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, color: RED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>Error</div>
                    <div style={{ fontSize: 14, color: TEXT }}>{u.error_message}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Row Detail Popup */}
      {selectedRow && (() => {
        const d = selectedRow;
        const sev = d.is_current ? 'current' : (d.severity || 'optional');
        const deviceUpdates = updates.filter(u => u.device_id === d.id);
        return (
          <div onClick={() => setSelectedRow(null)} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 32,
          }}>
            <div onClick={(e) => e.stopPropagation()} style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
              width: '100%', maxWidth: 680, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
              animation: 'modalIn 0.2s ease',
            }}>
              <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>

              {/* Header */}
              <div style={{ padding: '20px 28px', borderBottom: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FaMicrochip style={{ color: PRIMARY, fontSize: 18 }} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{d.device_name}</div>
                    <div style={{ fontSize: 12, color: TEXT_DIM }}>{d.device_type} &middot; {d.property_name}</div>
                  </div>
                </div>
                <button onClick={() => setSelectedRow(null)} style={{
                  background: '#ffffff0a', border: `1px solid ${BORDER}`, borderRadius: 8,
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: TEXT_DIM, fontSize: 16, transition: 'all 0.15s',
                }}>
                  <FaTimes />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: 28, overflowY: 'auto', flex: 1 }}>
                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                  <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Manufacturer</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{d.manufacturer || '--'}</div>
                  </div>
                  <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Severity</div>
                    <Badge severity={sev} />
                  </div>
                  <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Current Firmware</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: d.is_current ? GREEN : RED }}>{d.current_version}</div>
                  </div>
                  <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Latest Available</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: GREEN }}>{d.latest_version || '--'}</div>
                  </div>
                </div>

                {/* Update Action */}
                {!d.is_current && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: PRIMARY + '12', border: `1px solid ${PRIMARY}33`, borderRadius: 10, padding: '14px 20px', marginBottom: 24 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Firmware update available</div>
                      <div style={{ fontSize: 12, color: TEXT_DIM }}>{d.current_version} &#8594; {d.latest_version}</div>
                    </div>
                    <button onClick={() => { initiateUpdate(d); setSelectedRow(null); }}
                      disabled={initiating[d.id] || d.pending_update}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px',
                        background: d.pending_update ? BORDER : PRIMARY, color: '#fff', border: 'none',
                        borderRadius: 8, cursor: d.pending_update ? 'default' : 'pointer', fontSize: 13,
                        fontWeight: 600, opacity: initiating[d.id] ? 0.6 : 1 }}>
                      <FaDownload size={12} />
                      {d.pending_update ? 'Update Pending' : initiating[d.id] ? 'Starting...' : 'Update Now'}
                    </button>
                  </div>
                )}

                {/* Update History */}
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaClock size={13} style={{ color: TEXT_DIM }} />
                  Update History
                  <span style={{ fontSize: 12, color: TEXT_DIM, fontWeight: 400 }}>({deviceUpdates.length})</span>
                </div>
                {deviceUpdates.length === 0 && (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: TEXT_DIM, fontSize: 13 }}>
                    No update history for this device
                  </div>
                )}
                {deviceUpdates.map(u => {
                  const isActive = u.status === 'downloading' || u.status === 'installing';
                  return (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14,
                      background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 18px', marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontFamily: 'monospace', color: TEXT_DIM }}>{u.current_version}</span>
                          <span style={{ color: TEXT_DIM, fontSize: 12 }}>&#8594;</span>
                          <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{u.target_version}</span>
                        </div>
                        {isActive && <ProgressBar progress={u.progress} status={u.status} />}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {!isActive && <StatusBadge status={u.status} />}
                        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>
                          {u.initiated_by || ''} {u.scheduled_at ? `\u00B7 ${new Date(u.scheduled_at).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Compliance by Property Tab */}
      {tab === 'compliance' && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: 16, fontWeight: 600 }}>Compliance by Property</h3>
          {(!compliance?.by_property || compliance.by_property.length === 0) && (
            <div style={{ padding: 32, textAlign: 'center', color: TEXT_DIM }}>No property data available</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(compliance?.by_property || []).map((p, i) => {
              const propPct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
              const propColor = propPct > 80 ? GREEN : propPct > 60 ? YELLOW : RED;
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{p.property}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, color: TEXT_DIM }}>
                        {p.current}/{p.total} devices
                      </span>
                      {p.critical > 0 && (
                        <span style={{ fontSize: 12, color: RED, fontWeight: 600 }}>
                          {p.critical} critical
                        </span>
                      )}
                      <span style={{ fontSize: 14, fontWeight: 600, color: propColor }}>{propPct}%</span>
                    </div>
                  </div>
                  <div style={{ height: 12, borderRadius: 6, background: BORDER, overflow: 'hidden' }}>
                    <div style={{ width: `${propPct}%`, height: '100%', borderRadius: 6,
                      background: `linear-gradient(90deg, ${propColor}aa, ${propColor})`,
                      transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
