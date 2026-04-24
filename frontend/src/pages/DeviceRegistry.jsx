import React, { useState, useEffect, useCallback } from 'react';
import { FaNetworkWired, FaHeartbeat, FaMicrochip, FaExclamationTriangle, FaSyncAlt, FaSearch, FaServer, FaDesktop, FaTerminal, FaTimes } from 'react-icons/fa';

const API = '/api';
function getHeaders() {
  const token = localStorage.getItem('kastle_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function request(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...getHeaders(), ...options.headers } });
  if (!res.ok && res.status === 401) { localStorage.removeItem('kastle_token'); window.location.href = '/login'; return null; }
  return res.json();
}

const STATUS_COLORS = { Online: '#107E3E', Offline: '#BB0000', Maintenance: '#E76500', Unregistered: '#6A6D70' };
const TYPE_ICONS = { Camera: '📹', Reader: '🔑', Controller: '🖥️', Sensor: '📡', 'Alarm Panel': '🔔', 'Network Switch': '🔀' };

export default function DeviceRegistry() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProperty, setFilterProperty] = useState('');
  const [filterSubnet, setFilterSubnet] = useState('');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [deviceEvents, setDeviceEvents] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [commandLoading, setCommandLoading] = useState(null);
  const [commandResult, setCommandResult] = useState(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request(`${API}/devices?limit=200`);
      setDevices(Array.isArray(data) ? data : []);
    } catch { setDevices([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const loadDeviceEvents = async (deviceName) => {
    try {
      const data = await request(`${API}/device_events?search=${encodeURIComponent(deviceName)}&limit=5`);
      setDeviceEvents(Array.isArray(data) ? data : []);
    } catch { setDeviceEvents([]); }
  };

  const handleNetworkScan = async () => {
    setScanning(true);
    try {
      const data = await request(`${API}/devices/network-scan`);
      setScanResult(data);
    } catch { setScanResult(null); }
    setScanning(false);
  };

  const handleCommand = async (deviceId, command) => {
    setCommandLoading(command);
    setCommandResult(null);
    try {
      const data = await request(`${API}/devices/${deviceId}/command`, {
        method: 'POST', body: JSON.stringify({ command })
      });
      setCommandResult(data);
      if (command === 'reboot') setTimeout(loadDevices, 1000);
    } catch { setCommandResult({ success: false, message: 'Command failed' }); }
    setCommandLoading(null);
  };

  const selectDevice = (device) => {
    if (selectedDevice?.id === device.id) { setSelectedDevice(null); return; }
    setSelectedDevice(device);
    loadDeviceEvents(device.name);
    setCommandResult(null);
  };

  const total = devices.length;
  const online = devices.filter(d => d.status === 'Online').length;
  const offline = devices.filter(d => d.status === 'Offline').length;
  const maintenance = devices.filter(d => d.status === 'Maintenance').length;
  const healthPct = total > 0 ? Math.round((online / total) * 100) : 0;
  const avgCpu = devices.filter(d => d.cpu_usage > 0).length > 0
    ? (devices.filter(d => d.cpu_usage > 0).reduce((s, d) => s + parseFloat(d.cpu_usage || 0), 0) / devices.filter(d => d.cpu_usage > 0).length).toFixed(1)
    : '0.0';
  const needsAttention = devices.filter(d => d.status === 'Offline' || parseFloat(d.cpu_usage || 0) > 90 || parseFloat(d.temperature || 0) > 75).length;

  const types = [...new Set(devices.map(d => d.device_type).filter(Boolean))];
  const statuses = [...new Set(devices.map(d => d.status).filter(Boolean))];
  const properties = [...new Set(devices.map(d => d.property_name).filter(Boolean))];
  const subnets = [...new Set(devices.map(d => d.subnet).filter(Boolean))];

  const filtered = devices.filter(d => {
    if (searchTerm && !d.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !d.ip_address?.includes(searchTerm)) return false;
    if (filterType && d.device_type !== filterType) return false;
    if (filterStatus && d.status !== filterStatus) return false;
    if (filterProperty && d.property_name !== filterProperty) return false;
    if (filterSubnet && d.subnet !== filterSubnet) return false;
    return true;
  });

  const subnetGroups = {};
  devices.forEach(d => {
    const sub = d.subnet || 'Unknown';
    if (!subnetGroups[sub]) subnetGroups[sub] = { subnet: sub, devices: [], online: 0, total: 0, property: d.property_name };
    subnetGroups[sub].devices.push(d);
    subnetGroups[sub].total++;
    if (d.status === 'Online') subnetGroups[sub].online++;
  });

  const healthColor = healthPct > 90 ? '#107E3E' : healthPct > 70 ? '#E76500' : '#BB0000';

  const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const commandButtons = [
    { cmd: 'reboot', label: 'Reboot', color: '#BB0000' },
    { cmd: 'restart_service', label: 'Restart Service', color: '#E76500' },
    { cmd: 'capture_snapshot', label: 'Snapshot', color: '#0070F2' },
    { cmd: 'update_firmware', label: 'Update FW', color: '#8B47D7' },
    { cmd: 'lock_door', label: 'Lock Door', color: '#107E3E' },
    { cmd: 'unlock_door', label: 'Unlock Door', color: '#E76500' },
    { cmd: 'silence_alarm', label: 'Silence Alarm', color: '#6A6D70' },
  ];

  return (
    <div style={{ padding: '0', maxWidth: 1600, margin: '0 auto' }}>
      {/* Network Health Banner */}
      <div style={{ background: `linear-gradient(135deg, ${healthColor}, ${healthColor}dd)`, borderRadius: 12, padding: '20px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <FaNetworkWired size={28} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {online} devices online / {total} total — Network Health: {healthPct}%
            </div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
              {offline} offline · {maintenance} in maintenance · {subnets.length} subnets
            </div>
          </div>
        </div>
        <button onClick={handleNetworkScan} disabled={scanning}
          style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '10px 20px', borderRadius: 8, cursor: scanning ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaSyncAlt size={14} className={scanning ? 'spin' : ''} />
          {scanning ? 'Scanning...' : 'Network Scan'}
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Total Devices', value: total, icon: FaServer, color: '#0854A0' },
          { label: 'Online / Offline', value: `${online} / ${offline}`, icon: FaHeartbeat, color: '#107E3E' },
          { label: 'Avg CPU Usage', value: `${avgCpu}%`, icon: FaMicrochip, color: '#E76500' },
          { label: 'Needs Attention', value: needsAttention, icon: FaExclamationTriangle, color: '#BB0000' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '18px 20px', border: '1px solid #E8EBF0', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: s.color + '12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <s.icon size={20} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1A2233' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#6A6D70' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Main Table Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Filters */}
          <div style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', marginBottom: 16, border: '1px solid #E8EBF0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <FaSearch size={12} style={{ position: 'absolute', left: 10, top: 11, color: '#8B8D90' }} />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by name or IP..."
                style={{ width: '100%', padding: '8px 8px 8px 30px', border: '1px solid #DDE1E6', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #DDE1E6', borderRadius: 6, fontSize: 13, background: '#fff' }}>
              <option value="">All Types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #DDE1E6', borderRadius: 6, fontSize: 13, background: '#fff' }}>
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #DDE1E6', borderRadius: 6, fontSize: 13, background: '#fff', maxWidth: 180 }}>
              <option value="">All Properties</option>
              {properties.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterSubnet} onChange={e => setFilterSubnet(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #DDE1E6', borderRadius: 6, fontSize: 13, background: '#fff' }}>
              <option value="">All Subnets</option>
              {subnets.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Device Table */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E8EBF0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8F9FB', borderBottom: '2px solid #E8EBF0' }}>
                  {['Status','Name','Type','IP Address','MAC','Property','Last Seen','CPU','Temp'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'CPU' || h === 'Temp' ? 'right' : 'left', fontWeight: 600, color: '#354A5F' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#8B8D90' }}>Loading devices...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#8B8D90' }}>No devices found</td></tr>
                ) : filtered.map(d => (
                  <React.Fragment key={d.id}>
                    <tr onClick={() => selectDevice(d)}
                      style={{ borderBottom: '1px solid #F0F2F5', cursor: 'pointer', background: selectedDevice?.id === d.id ? '#F0F5FF' : '#fff', transition: 'background 0.15s' }}
                      onMouseEnter={e => { if (selectedDevice?.id !== d.id) e.currentTarget.style.background = '#F8F9FB'; }}
                      onMouseLeave={e => { if (selectedDevice?.id !== d.id) e.currentTarget.style.background = '#fff'; }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[d.status] || '#6A6D70' }} />
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1A2233' }}>
                        <span style={{ marginRight: 6 }}>{TYPE_ICONS[d.device_type] || '📦'}</span>{d.name}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#354A5F' }}>{d.device_type}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#0854A0', fontSize: 12 }}>{d.ip_address}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#6A6D70', fontSize: 11 }}>{d.mac_address}</td>
                      <td style={{ padding: '10px 14px', color: '#354A5F', fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.property_name}</td>
                      <td style={{ padding: '10px 14px', color: '#6A6D70', fontSize: 12 }}>{formatDate(d.last_seen)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: parseFloat(d.cpu_usage || 0) > 90 ? '#BB0000' : '#354A5F', fontWeight: parseFloat(d.cpu_usage || 0) > 90 ? 700 : 400 }}>
                        {d.cpu_usage > 0 ? `${parseFloat(d.cpu_usage).toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: parseFloat(d.temperature || 0) > 75 ? '#BB0000' : '#354A5F', fontWeight: parseFloat(d.temperature || 0) > 75 ? 700 : 400 }}>
                        {d.temperature > 0 ? `${parseFloat(d.temperature).toFixed(1)}°C` : '—'}
                      </td>
                    </tr>
                    {selectedDevice?.id === d.id && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <div style={{ background: '#F8F9FB', padding: '20px 24px', borderTop: '2px solid #0854A0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                              <h3 style={{ margin: 0, color: '#1A2233', fontSize: 16 }}>
                                {TYPE_ICONS[d.device_type]} {d.name}
                                <span style={{ fontSize: 12, fontWeight: 400, color: '#6A6D70', marginLeft: 12 }}>
                                  {d.manufacturer} {d.model} — FW {d.firmware_version}
                                </span>
                              </h3>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedDevice(null); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6A6D70' }}><FaTimes size={16} /></button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                              {[
                                { label: 'IP Address', value: d.ip_address },
                                { label: 'MAC Address', value: d.mac_address },
                                { label: 'Subnet', value: d.subnet },
                                { label: 'Port / Protocol', value: `${d.port} / ${d.protocol}` },
                                { label: 'Property', value: d.property_name },
                                { label: 'Zone', value: d.zone_name || '—' },
                                { label: 'Uptime', value: d.uptime_hours > 0 ? `${parseFloat(d.uptime_hours).toFixed(0)}h` : '—' },
                                { label: 'Memory', value: d.memory_usage > 0 ? `${parseFloat(d.memory_usage).toFixed(1)}%` : '—' },
                              ].map((item, idx) => (
                                <div key={idx} style={{ background: '#fff', borderRadius: 6, padding: '10px 12px', border: '1px solid #E8EBF0' }}>
                                  <div style={{ fontSize: 11, color: '#6A6D70', marginBottom: 2 }}>{item.label}</div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2233', fontFamily: item.label.includes('Address') || item.label === 'Subnet' ? 'monospace' : 'inherit' }}>{item.value}</div>
                                </div>
                              ))}
                            </div>

                            {d.config && typeof d.config === 'object' && Object.keys(d.config).length > 0 && (
                              <div style={{ background: '#fff', borderRadius: 6, padding: '10px 12px', border: '1px solid #E8EBF0', marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: '#6A6D70', marginBottom: 6 }}>Device Configuration</div>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                  {Object.entries(d.config).map(([k, v]) => (
                                    <span key={k} style={{ background: '#F0F5FF', padding: '4px 10px', borderRadius: 4, fontSize: 12, color: '#0854A0' }}>
                                      {k}: <strong>{String(v)}</strong>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#354A5F', marginBottom: 8 }}>Device Commands</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {commandButtons.map(cb => (
                                  <button key={cb.cmd}
                                    onClick={(e) => { e.stopPropagation(); handleCommand(d.id, cb.cmd); }}
                                    disabled={commandLoading === cb.cmd}
                                    style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${cb.color}40`, background: cb.color + '10', color: cb.color, fontWeight: 600, fontSize: 12, cursor: commandLoading === cb.cmd ? 'wait' : 'pointer' }}>
                                    {commandLoading === cb.cmd ? '...' : cb.label}
                                  </button>
                                ))}
                              </div>
                              {commandResult && (
                                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: commandResult.success ? '#E6F4EA' : '#FDEDED', color: commandResult.success ? '#107E3E' : '#BB0000', fontSize: 12 }}>
                                  {commandResult.message}
                                </div>
                              )}
                            </div>

                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#354A5F', marginBottom: 8 }}>Recent Events</div>
                              {deviceEvents.length === 0 ? (
                                <div style={{ fontSize: 12, color: '#8B8D90', padding: '8px 0' }}>No recent events</div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {deviceEvents.map((ev, i) => (
                                    <div key={i} style={{ background: '#fff', borderRadius: 6, padding: '8px 12px', border: '1px solid #E8EBF0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                                      <div>
                                        <span style={{ fontWeight: 600, color: ev.severity === 'critical' ? '#BB0000' : ev.severity === 'warning' ? '#E76500' : '#107E3E' }}>{ev.severity}</span>
                                        <span style={{ color: '#6A6D70', marginLeft: 8 }}>{ev.event_type}: {ev.description?.substring(0, 80)}</span>
                                      </div>
                                      <span style={{ color: '#8B8D90' }}>{formatDate(ev.created_at)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Subnet Sidebar */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E8EBF0', padding: '16px', position: 'sticky', top: 24 }}>
            <h4 style={{ margin: '0 0 14px', color: '#1A2233', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FaDesktop size={14} /> Subnet Map
            </h4>
            {Object.values(subnetGroups).map((sg, i) => {
              const sgHealth = sg.total > 0 ? Math.round((sg.online / sg.total) * 100) : 0;
              const sgColor = sgHealth > 90 ? '#107E3E' : sgHealth > 70 ? '#E76500' : '#BB0000';
              return (
                <div key={i} style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #E8EBF0', background: '#F8F9FB' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#0854A0' }}>{sg.subnet}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sgColor }}>{sgHealth}%</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6A6D70', marginBottom: 6 }}>{sg.property}</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {sg.devices.map((d, j) => (
                      <span key={j} title={`${d.name} (${d.ip_address})`}
                        onClick={() => selectDevice(d)}
                        style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLORS[d.status] || '#6A6D70', cursor: 'pointer', display: 'inline-block', transition: 'transform 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.5)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: '#8B8D90', marginTop: 4 }}>
                    {sg.online}/{sg.total} online
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* Network Scan Results Modal */}
      {scanResult && (
        <div onClick={() => setScanResult(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 14, width: 560, maxHeight: '70vh',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            animation: 'scanModalIn 0.25s ease-out',
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0854A0, #0070F2)',
              padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <FaSyncAlt size={20} color="#fff" />
                <div>
                  <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Network Scan Complete</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>
                    Scanned at {formatDate(scanResult.scanned_at)}
                  </div>
                </div>
              </div>
              <button onClick={() => setScanResult(null)} style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
                width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><FaTimes /></button>
            </div>

            {/* Summary stats */}
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '12px 24px', borderBottom: '1px solid #E8EBF0', flexShrink: 0 }}>
              {[
                { label: 'Devices', value: scanResult.total_devices, color: '#0854A0' },
                { label: 'Subnets', value: scanResult.subnets?.length || 0, color: '#0070F2' },
                { label: 'Online', value: scanResult.subnets?.reduce((s, sub) => s + sub.online, 0) || 0, color: '#107E3E' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#6A6D70' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Subnet list — scrollable */}
            <div style={{ padding: '12px 24px 16px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#354A5F', marginBottom: 10 }}>Subnet Details</div>
              {scanResult.subnets?.map((sub, i) => {
                const hc = sub.health > 90 ? '#107E3E' : sub.health > 70 ? '#E76500' : '#BB0000';
                return (
                  <div key={i} style={{
                    padding: '10px 14px', marginBottom: 6, borderRadius: 8,
                    border: '1px solid #E8EBF0', background: '#F8F9FB',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#0854A0' }}>{sub.subnet}</span>
                        <span style={{ fontSize: 11, color: '#6A6D70', marginLeft: 8 }}>{sub.property}</span>
                      </div>
                      <span style={{ color: hc, fontSize: 13, fontWeight: 700 }}>{sub.health}%</span>
                    </div>
                    {/* Health bar */}
                    <div style={{ height: 4, background: '#E8EBF0', borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${sub.health}%`, background: hc, borderRadius: 2 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#6A6D70' }}>
                      <span><strong style={{ color: '#107E3E' }}>{sub.online}</strong> online</span>
                      <span><strong style={{ color: '#BB0000' }}>{sub.offline}</strong> offline</span>
                      <span><strong style={{ color: '#354A5F' }}>{sub.total}</strong> total</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        @keyframes scanModalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  );
}
