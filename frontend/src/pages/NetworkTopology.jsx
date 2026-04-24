import React, { useState, useEffect } from 'react';
import {
  FaServer,
  FaWifi,
  FaDesktop,
  FaNetworkWired,
  FaChevronDown,
  FaChevronRight,
  FaCircle,
} from 'react-icons/fa';

/* ── dark-theme palette ─────────────────────────────────────────── */
const BG      = '#0a0e17';
const CARD    = '#111827';
const BORDER  = '#1e293b';
const TEXT    = '#e2e8f0';
const TEXT_DIM = '#94a3b8';
const PRIMARY = '#3b82f6';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const YELLOW  = '#f59e0b';

/* ── helpers ────────────────────────────────────────────────────── */
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('kastle_token')}` };
}

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'healthy' || s === 'online') return GREEN;
  if (s === 'degraded' || s === 'warning') return YELLOW;
  if (s === 'down' || s === 'critical' || s === 'offline') return RED;
  return TEXT_DIM;
}

function healthColor(pct) {
  if (pct >= 80) return GREEN;
  if (pct >= 50) return YELLOW;
  return RED;
}

function deviceIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('switch') || t.includes('router')) return <FaNetworkWired />;
  if (t.includes('camera') || t.includes('wireless') || t.includes('ap')) return <FaWifi />;
  if (t.includes('server') || t.includes('nvr') || t.includes('controller')) return <FaServer />;
  return <FaDesktop />;
}

/* ── Stat Card ──────────────────────────────────────────────────── */
function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: '18px 22px', flex: '1 1 0', minWidth: 160, textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || TEXT }}>{value}</div>
      <div style={{ fontSize: 13, color: TEXT_DIM, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/* ── Device Pill ────────────────────────────────────────────────── */
function DevicePill({ device, expanded, onToggle }) {
  const sc = statusColor(device.status);
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#1a2233', border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '8px 14px', cursor: 'pointer', transition: 'background .15s',
          userSelect: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1f2b3d'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#1a2233'; }}
      >
        <span style={{ color: PRIMARY, fontSize: 14, flexShrink: 0 }}>
          {deviceIcon(device.device_type)}
        </span>
        <span style={{ color: TEXT, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {device.name}
        </span>
        <FaCircle style={{ color: sc, fontSize: 7, flexShrink: 0, marginLeft: 'auto' }} />
        <span style={{ color: TEXT_DIM, fontSize: 11, flexShrink: 0 }}>
          {expanded ? <FaChevronDown /> : <FaChevronRight />}
        </span>
      </div>

      {expanded && (
        <div style={{
          background: '#0d1321', border: `1px solid ${BORDER}`, borderTop: 'none',
          borderRadius: '0 0 8px 8px', padding: '12px 16px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px',
          fontSize: 12,
        }}>
          <Detail label="Type" value={device.device_type} />
          <Detail label="Status" value={device.status} color={sc} />
          <Detail label="Firmware" value={device.firmware} />
          <Detail label="Port" value={device.port} />
          <Detail label="Bandwidth" value={device.bandwidth} />
          <Detail label="Health" value={device.health_status} color={statusColor(device.health_status)} />
          <Detail label="Connection" value={device.connection_type} />
          <Detail label="ID" value={device.id} />
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, color }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <span style={{ color: TEXT_DIM }}>{label}:</span>
      <span style={{ color: color || TEXT, fontWeight: 500 }}>{value || '—'}</span>
    </div>
  );
}

/* ── Switch Node ────────────────────────────────────────────────── */
function SwitchNode({ sw }) {
  const sc = statusColor(sw.status);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 20px', background: '#162032', border: `2px solid ${PRIMARY}`,
      borderRadius: 12, minWidth: 120, textAlign: 'center',
    }}>
      <FaNetworkWired style={{ color: PRIMARY, fontSize: 26, marginBottom: 6 }} />
      <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{sw.name}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
        <FaCircle style={{ color: sc, fontSize: 7 }} />
        <span style={{ color: sc, fontSize: 11 }}>{sw.status}</span>
      </div>
    </div>
  );
}

/* ── Subnet Card (tree layout) ──────────────────────────────────── */
function SubnetCard({ subnet, expandedDevices, toggleDevice }) {
  const hc = healthColor(subnet.health ?? 100);
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: 20, marginBottom: 16,
    }}>
      {/* subnet header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FaNetworkWired style={{ color: PRIMARY, fontSize: 16 }} />
          <span style={{ color: TEXT, fontSize: 15, fontWeight: 600 }}>{subnet.subnet}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: TEXT_DIM, fontSize: 12 }}>Health</span>
          <span style={{ color: hc, fontSize: 13, fontWeight: 700 }}>
            {subnet.health != null ? `${subnet.health}%` : '—'}
          </span>
        </div>
      </div>

      {/* tree layout: switch → devices */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* switch node centered */}
        {subnet.switch_device && <SwitchNode sw={subnet.switch_device} />}

        {/* vertical connector from switch */}
        {subnet.devices && subnet.devices.length > 0 && (
          <div style={{
            width: 2, height: 24, background: BORDER,
          }} />
        )}

        {/* horizontal rail + device branches */}
        {subnet.devices && subnet.devices.length > 0 && (
          <div style={{ width: '100%', position: 'relative' }}>
            {/* horizontal rail line */}
            <div style={{
              position: 'absolute', top: 0, left: '10%', right: '10%',
              height: 2, background: BORDER,
            }} />

            {/* device columns hanging from rail */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
              gap: 0, paddingTop: 0,
            }}>
              {subnet.devices.map((dev, idx) => {
                const key = `${subnet.subnet}-${dev.id}`;
                return (
                  <div
                    key={dev.id || idx}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      flex: '0 0 auto', width: `${Math.max(100 / Math.min(subnet.devices.length, 5), 20)}%`,
                      minWidth: 180, maxWidth: 260, padding: '0 6px',
                    }}
                  >
                    {/* vertical drop line from rail to pill */}
                    <div style={{
                      width: 2, height: 22, background: BORDER,
                    }} />
                    <DevicePill
                      device={dev}
                      expanded={!!expandedDevices[key]}
                      onToggle={() => toggleDevice(key)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(!subnet.devices || subnet.devices.length === 0) && (
          <div style={{ color: TEXT_DIM, fontSize: 13, marginTop: 12 }}>No devices in subnet</div>
        )}
      </div>
    </div>
  );
}

/* ── Property Card ──────────────────────────────────────────────── */
function PropertyCard({ property, expandedDevices, toggleDevice }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{
      background: '#0d1220', border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: 24, marginBottom: 24,
    }}>
      {/* property header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          marginBottom: collapsed ? 0 : 20, userSelect: 'none',
        }}
      >
        <span style={{ color: PRIMARY, fontSize: 12 }}>
          {collapsed ? <FaChevronRight /> : <FaChevronDown />}
        </span>
        <FaServer style={{ color: PRIMARY, fontSize: 18 }} />
        <span style={{ color: TEXT, fontSize: 18, fontWeight: 700 }}>{property.name}</span>
        <span style={{
          marginLeft: 'auto', color: TEXT_DIM, fontSize: 12,
          background: '#1a2233', padding: '3px 10px', borderRadius: 6,
        }}>
          {property.subnets ? property.subnets.length : 0} subnet{property.subnets?.length !== 1 ? 's' : ''}
        </span>
      </div>

      {!collapsed && property.subnets && property.subnets.map((sub, idx) => (
        <SubnetCard
          key={sub.subnet || idx}
          subnet={sub}
          expandedDevices={expandedDevices}
          toggleDevice={toggleDevice}
        />
      ))}
    </div>
  );
}

/* ── Uplinks Section ────────────────────────────────────────────── */
function UplinksSection({ uplinks }) {
  if (!uplinks || uplinks.length === 0) return null;
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: 24, marginTop: 28,
    }}>
      <h3 style={{ color: TEXT, fontSize: 16, fontWeight: 700, margin: '0 0 16px 0' }}>
        Cross-Site Uplinks
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {uplinks.map((link, i) => {
          const sc = statusColor(link.status);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
              background: '#0d1321', borderRadius: 8, border: `1px solid ${BORDER}`,
            }}>
              {/* source */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }}>
                <FaNetworkWired style={{ color: PRIMARY, fontSize: 14 }} />
                <span style={{ color: TEXT, fontSize: 13, fontWeight: 500 }}>
                  {link.source_device_name || '—'}
                </span>
              </div>

              {/* fiber line */}
              <div style={{
                flex: 1, height: 2, background: `linear-gradient(90deg, ${PRIMARY}, ${sc})`,
                borderRadius: 1, position: 'relative', minWidth: 60,
              }}>
                <span style={{
                  position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 10, color: TEXT_DIM, whiteSpace: 'nowrap',
                }}>
                  {link.connection_type || 'Fiber'} — {link.bandwidth_mbps ? `${(link.bandwidth_mbps / 1000).toFixed(0)} Gbps` : '—'}
                </span>
              </div>

              {/* destination */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }}>
                <FaNetworkWired style={{ color: PRIMARY, fontSize: 14 }} />
                <span style={{ color: TEXT, fontSize: 13, fontWeight: 500 }}>
                  {link.target_device_name || '—'}
                </span>
              </div>

              {/* status dot */}
              <FaCircle style={{ color: sc, fontSize: 8, flexShrink: 0 }} />
              <span style={{ color: sc, fontSize: 12, minWidth: 60 }}>{link.status || '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Loading skeleton ───────────────────────────────────────────── */
function LoadingSkeleton() {
  const shimmer = {
    background: `linear-gradient(90deg, ${CARD} 25%, #1a2233 50%, ${CARD} 75%)`,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s ease-in-out infinite',
    borderRadius: 8,
  };
  return (
    <div>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ ...shimmer, flex: '1 1 0', height: 80 }} />
        ))}
      </div>
      {[1, 2].map(i => (
        <div key={i} style={{ ...shimmer, height: 220, marginBottom: 20 }} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function NetworkTopology() {
  const [data, setData]                   = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [expandedDevices, setExpandedDevices] = useState({});

  /* ── fetch topology ────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/topology/map', { headers: authHeaders() })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => { if (!cancelled) setData(json); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  /* ── toggle device detail expansion ────────────────────────────── */
  function toggleDevice(key) {
    setExpandedDevices(prev => ({ ...prev, [key]: !prev[key] }));
  }

  /* ── derived data ──────────────────────────────────────────────── */
  const summary    = data?.summary || {};
  const properties = data?.properties || [];
  const allUplinks = properties.flatMap(p => p.uplinks || []);

  const filteredProperties = propertyFilter === 'all'
    ? properties
    : properties.filter(p => p.name === propertyFilter);

  /* ── render ────────────────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh', background: BG, color: TEXT,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: '28px 32px 60px',
    }}>
      {/* page title */}
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px 0', color: TEXT }}>
        Network Topology
      </h1>
      <p style={{ color: TEXT_DIM, fontSize: 14, margin: '0 0 28px 0' }}>
        Hierarchical view of properties, subnets, switches and connected devices
      </p>

      {/* ── error state ─────────────────────────────────────────────── */}
      {error && (
        <div style={{
          background: '#1c1117', border: `1px solid ${RED}`, borderRadius: 10,
          padding: '14px 20px', marginBottom: 24, color: RED, fontSize: 14,
        }}>
          Failed to load topology: {error}
        </div>
      )}

      {/* ── loading state ───────────────────────────────────────────── */}
      {loading && <LoadingSkeleton />}

      {/* ── loaded content ──────────────────────────────────────────── */}
      {!loading && !error && data && (
        <>
          {/* ── summary banner ────────────────────────────────────────── */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24,
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
            padding: '16px 24px', marginBottom: 20,
          }}>
            <SummaryItem label="Properties" value={summary.total_properties} />
            <Divider />
            <SummaryItem label="Subnets" value={summary.total_subnets} />
            <Divider />
            <SummaryItem label="Devices" value={summary.total_devices} />
            <Divider />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: TEXT_DIM, fontSize: 13 }}>Network Health</span>
              <span style={{
                fontSize: 20, fontWeight: 700,
                color: healthColor(summary.health_pct ?? 0),
              }}>
                {summary.health_pct != null ? `${summary.health_pct}%` : '—'}
              </span>
            </div>
          </div>

          {/* ── stats row ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard label="Subnets" value={summary.total_subnets ?? 0} color={PRIMARY} />
            <StatCard label="Devices Online" value={summary.online_devices ?? 0} color={GREEN} />
            <StatCard label="Active Connections" value={summary.active_connections ?? 0} color={PRIMARY} />
            <StatCard label="Network Alerts" value={summary.alerts ?? 0} color={summary.alerts > 0 ? RED : GREEN} />
          </div>

          {/* ── property filter ───────────────────────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: TEXT_DIM, fontSize: 13, marginRight: 10 }}>
              Filter by Property
            </label>
            <select
              value={propertyFilter}
              onChange={e => setPropertyFilter(e.target.value)}
              style={{
                background: CARD, color: TEXT, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: '8px 14px', fontSize: 14,
                outline: 'none', cursor: 'pointer', minWidth: 200,
              }}
            >
              <option value="all">All Properties</option>
              {properties.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* ── main topology tree ────────────────────────────────────── */}
          {filteredProperties.length === 0 && (
            <div style={{
              textAlign: 'center', color: TEXT_DIM, padding: '60px 0', fontSize: 15,
            }}>
              No properties found.
            </div>
          )}

          {filteredProperties.map((prop, idx) => (
            <PropertyCard
              key={prop.name || idx}
              property={prop}
              expandedDevices={expandedDevices}
              toggleDevice={toggleDevice}
            />
          ))}

          {/* ── cross-site uplinks ────────────────────────────────────── */}
          <UplinksSection uplinks={allUplinks} />
        </>
      )}
    </div>
  );
}

/* ── tiny inline components ─────────────────────────────────────── */
function SummaryItem({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: TEXT_DIM, fontSize: 13 }}>{label}</span>
      <span style={{ color: TEXT, fontSize: 18, fontWeight: 700 }}>{value ?? '—'}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 28, background: BORDER }} />;
}
