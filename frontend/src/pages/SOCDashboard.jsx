import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FaShieldAlt, FaPlay, FaPause, FaVideo, FaBolt, FaBrain, FaExclamationTriangle, FaChartLine, FaDesktop } from 'react-icons/fa';
import { fetchList, callAI } from '../api';

const EVENT_LABELS = {
  access_granted: 'Access Granted', access_denied: 'Access Denied',
  camera_motion: 'Camera Motion', sensor_triggered: 'Sensor Triggered',
  device_offline: 'Device Offline', device_online: 'Device Online',
  alarm_triggered: 'Alarm Triggered', alarm_cleared: 'Alarm Cleared',
  health_warning: 'Health Warning', tailgating_detected: 'Tailgating',
};
const FILTERS = {
  All: null,
  Access: ['access_granted', 'access_denied'],
  Camera: ['camera_motion', 'tailgating_detected'],
  Sensor: ['sensor_triggered'],
  Alarm: ['alarm_triggered', 'alarm_cleared'],
  Health: ['health_warning', 'device_online', 'device_offline'],
};
const SEV_COLOR = { info: '#0070F2', warning: '#E76500', critical: '#BB0000' };
const SEV_BG = { info: '#e8f0fe', warning: '#fff3e0', critical: '#ffebee' };

function getThreat(events) {
  if (!events.length) return { level: 'Low', color: '#107E3E', bg: '#e8f5e9' };
  const r = events.slice(0, 50);
  const c = r.filter(e => e.severity === 'critical').length;
  const w = r.filter(e => e.severity === 'warning').length;
  if (c >= 5) return { level: 'Critical', color: '#fff', bg: '#BB0000' };
  if (c >= 2 || w >= 8) return { level: 'High', color: '#fff', bg: '#E76500' };
  if (c >= 1 || w >= 3) return { level: 'Medium', color: '#1B2838', bg: '#fff3e0' };
  return { level: 'Low', color: '#fff', bg: '#107E3E' };
}

function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function parseMarkdown(text) {
  if (!text) return '';
  try {
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/```[\s\S]*?```/g, (m) => '<pre>' + m.slice(3, -3).trim() + '</pre>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
    html = html.replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => /^[\s-:]+$/.test(c))) return '';
      return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
    });
    return '<p>' + html + '</p>';
  } catch (e) {
    return '<pre>' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
  }
}

export default function SOCDashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [simOn, setSimOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('All');
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [camMotions, setCamMotions] = useState({});
  const [flashCam, setFlashCam] = useState(null);
  const [frozenEvents, setFrozenEvents] = useState(null);
  const feedRef = useRef(null);

  useEffect(() => {
    fetchList('device_events').then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {});
    fetchList('cameras').then(d => setCameras(Array.isArray(d) ? d : [])).catch(() => {});
    const token = localStorage.getItem('kastle_token');
    fetch('/api/simulator/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setSimOn(d.running)).catch(() => {});
  }, []);

  useEffect(() => {
    let socket;
    try {
      socket = io('http://localhost:4002', { transports: ['websocket', 'polling'], reconnectionAttempts: 5 });
      socket.on('device-event', (evt) => {
        setEvents(prev => [evt, ...prev].slice(0, 500));
        if (evt.device_type === 'Camera' && evt.event_type === 'camera_motion') {
          setCamMotions(prev => ({ ...prev, [evt.device_name]: evt.created_at }));
          setFlashCam(evt.device_name);
          setTimeout(() => setFlashCam(null), 2000);
        }
      });
      socket.on('connect_error', () => {});
    } catch (e) {}
    return () => { if (socket) socket.disconnect(); };
  }, []);

  useEffect(() => {
    if (!paused && feedRef.current) feedRef.current.scrollTop = 0;
  }, [events, paused]);

  const toggleSim = async () => {
    const token = localStorage.getItem('kastle_token');
    const r = await fetch('/api/simulator/toggle', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const d = await r.json();
    setSimOn(d.running);
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const token = localStorage.getItem('kastle_token');
      if (!token) { setAnalysis('DEBUG: No kastle_token found in localStorage'); setAnalyzing(false); return; }
      const res = await fetch('/api/ai/threat-analyzer', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setAnalysis('DEBUG: HTTP ' + res.status + ' - ' + (errData.error || res.statusText));
        setAnalyzing(false);
        return;
      }
      const data = await res.json();
      const text = data.response || data.result || JSON.stringify(data).slice(0, 500);
      setAnalysis(text || 'DEBUG: Response was empty. Keys: ' + Object.keys(data).join(', '));
    } catch (e) {
      setAnalysis('DEBUG ERROR: ' + e.message);
    }
    setAnalyzing(false);
  };

  const displayEvents = paused && frozenEvents ? frozenEvents : events;
  const filtered = filter === 'All' ? displayEvents : displayEvents.filter(e => FILTERS[filter]?.includes(e.event_type));
  const threat = getThreat(events);
  const now = Date.now();
  const recent5 = events.filter(e => new Date(e.created_at).getTime() > now - 300000);
  const epm = recent5.length > 0 ? (recent5.length / 5).toFixed(1) : '0.0';
  const alarms = Math.max(0, events.filter(e => e.event_type === 'alarm_triggered').length - events.filter(e => e.event_type === 'alarm_cleared').length);
  const onlineCams = cameras.filter(c => c.status === 'Online').length;

  return (
    <div>
      {/* Threat Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', borderRadius: 8, marginBottom: 20, background: threat.bg, color: threat.color }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <FaShieldAlt size={24} />
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Current Threat Level</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{threat.level}</div>
          </div>
        </div>
        <button onClick={runAnalysis} disabled={analyzing} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', border: '2px solid rgba(255,255,255,0.5)', borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <FaBrain /> {analyzing ? 'Analyzing...' : 'Analyze Threats'}
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { icon: <FaChartLine size={20} style={{ color: '#0070F2' }} />, val: epm, label: 'Events/min' },
          { icon: <FaExclamationTriangle size={20} style={{ color: alarms > 0 ? '#BB0000' : '#107E3E' }} />, val: alarms, label: 'Active Alarms' },
          { icon: <FaVideo size={20} style={{ color: '#0070F2' }} />, val: `${onlineCams}/${cameras.length}`, label: 'Cameras Online' },
          { icon: <FaDesktop size={20} style={{ color: simOn ? '#107E3E' : '#999' }} />, val: simOn ? 'ON' : 'OFF', label: 'Simulator', action: true },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e0e3e7', position: 'relative' }}>
            {s.icon}
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1B2838' }}>{s.val}</div>
              <div style={{ fontSize: 12, color: '#6c7a8d' }}>{s.label}</div>
            </div>
            {s.action && (
              <button onClick={toggleSim} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: simOn ? '#ffebee' : '#e8f5e9', color: simOn ? '#BB0000' : '#107E3E' }}>
                {simOn ? <FaPause size={12} /> : <FaPlay size={12} />}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Main Grid: Feed + Cameras */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, marginBottom: 20 }}>
        {/* Event Feed */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0e3e7', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', maxHeight: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e0e3e7' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, margin: 0 }}><FaBolt /> Live Event Feed</h3>
            <button onClick={() => {
              if (!paused) { setFrozenEvents([...events]); }
              else { setFrozenEvents(null); }
              setPaused(!paused);
            }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1px solid #e0e3e7', borderRadius: 6, background: paused ? '#fff3e0' : '#fff', color: paused ? '#E76500' : '#6c7a8d', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {paused ? <><FaPlay size={10} /> Resume</> : <><FaPause size={10} /> Pause</>}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '10px 20px', borderBottom: '1px solid #e0e3e7', flexWrap: 'wrap' }}>
            {Object.keys(FILTERS).map(k => (
              <button key={k} onClick={() => setFilter(k)} style={{ padding: '4px 14px', border: '1px solid', borderColor: filter === k ? '#0070F2' : '#e0e3e7', borderRadius: 16, background: filter === k ? '#0070F2' : '#fff', color: filter === k ? '#fff' : '#6c7a8d', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {k}
              </button>
            ))}
          </div>
          <div ref={feedRef} style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: '#999' }}>No events yet. Start the simulator or send webhook events.</div>}
            {filtered.slice(0, 200).map((e, i) => (
              <div key={e.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: '1px solid #f0f2f5', fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[e.severity] || '#999', flexShrink: 0 }} />
                <span style={{ color: '#999', fontSize: 11, minWidth: 48, flexShrink: 0 }}>{timeAgo(e.created_at)}</span>
                <span style={{ padding: '2px 8px', borderRadius: 4, background: SEV_BG[e.severity] || '#f5f5f5', color: SEV_COLOR[e.severity] || '#999', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {EVENT_LABELS[e.event_type] || e.event_type}
                </span>
                <span style={{ fontWeight: 600, color: '#1B2838', whiteSpace: 'nowrap', flexShrink: 0 }}>{e.device_name}</span>
                <span style={{ color: '#6c7a8d', whiteSpace: 'nowrap', flexShrink: 0 }}>{e.property_name}</span>
                <span style={{ color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{e.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Camera Grid */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0e3e7', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '14px 20px', maxHeight: 520, overflowY: 'auto' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, margin: '0 0 14px 0' }}><FaVideo /> Camera Grid</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {cameras.slice(0, 6).map(cam => (
              <div key={cam.id} onClick={() => navigate(`/module/cameras/${cam.id}`)} style={{ border: `1px solid ${flashCam === cam.name ? '#E76500' : '#e0e3e7'}`, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', transition: 'all 0.3s', boxShadow: flashCam === cam.name ? '0 0 12px rgba(231,101,0,0.3)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8f9fa', borderBottom: '1px solid #f0f2f5' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1B2838' }}>{cam.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', background: cam.status === 'Online' ? '#e8f5e9' : '#ffebee', color: cam.status === 'Online' ? '#107E3E' : '#BB0000' }}>{cam.status}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: '#1B2838' }}>
                  <FaVideo size={28} style={{ color: cam.status === 'Online' ? '#0070F2' : '#666', opacity: 0.4 }} />
                </div>
                <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#6c7a8d' }}>{cam.property_name}</span>
                  <span style={{ color: '#E76500', fontStyle: 'italic' }}>{camMotions[cam.name] ? `Motion: ${timeAgo(camMotions[cam.name])}` : 'No recent motion'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0e3e7', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e0e3e7' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, margin: 0 }}><FaBrain /> AI Threat Analysis</h3>
          <button onClick={runAnalysis} disabled={analyzing} style={{ padding: '6px 16px', border: '1px solid #0070F2', borderRadius: 6, background: '#fff', color: '#0070F2', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {analyzing ? 'Running...' : 'Run Analysis'}
          </button>
        </div>
        <div style={{ padding: 20, minHeight: 80 }}>
          {analyzing && (
            <div style={{ padding: 32, textAlign: 'center', color: '#0070F2' }}>
              <div className="spinner" style={{ margin: '0 auto 12px', width: 28, height: 28, border: '3px solid #e0e3e7', borderTopColor: '#0070F2', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Analyzing security events and threat patterns...
            </div>
          )}
          {!analyzing && analysis && (
            <div style={{ maxHeight: 600, overflowY: 'auto', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#1B2838', padding: 8 }}>
              {analysis}
            </div>
          )}
          {!analyzing && !analysis && <div style={{ padding: 32, textAlign: 'center', color: '#ccc' }}>Click "Run Analysis" or "Analyze Threats" to get an AI-powered threat assessment.</div>}
        </div>
      </div>
    </div>
  );
}
