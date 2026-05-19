const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const auth = require('./middleware/auth');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config({ path: __dirname + '/../.env' });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json());

const PORT = process.env.BACKEND_PORT || 4002;
const JWT_SECRET = process.env.JWT_SECRET;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';

// ─── Auth Routes ────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, full_name: user.full_name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, full_name, role FROM users WHERE id = $1', [req.user.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Dashboard Stats ────────────────────────────────────────────
app.get('/api/dashboard/stats', auth, async (req, res) => {
  try {
    const [
      properties,
      cameras,
      camerasOnline,
      camerasOffline,
      incidents,
      incidentsBySeverity,
      accessEvents,
      accessGranted,
      accessDenied,
      guards,
      guardsOnDuty,
      visitors,
      visitorsCheckedIn,
      tenants,
      credentials,
      workOrders,
      zones,
      devicesTotal,
      devicesOnline,
      devicesByType,
      devicesByStatus,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM properties'),
      pool.query('SELECT COUNT(*) FROM cameras'),
      pool.query("SELECT COUNT(*) FROM cameras WHERE status = 'Online'"),
      pool.query("SELECT COUNT(*) FROM cameras WHERE status = 'Offline'"),
      pool.query("SELECT COUNT(*) FROM incidents WHERE status != 'Resolved'"),
      pool.query("SELECT severity, COUNT(*) as count FROM incidents GROUP BY severity"),
      pool.query('SELECT COUNT(*) FROM access_events'),
      pool.query("SELECT COUNT(*) FROM access_events WHERE status = 'Granted'"),
      pool.query("SELECT COUNT(*) FROM access_events WHERE status = 'Denied'"),
      pool.query('SELECT COUNT(*) FROM guards'),
      pool.query("SELECT COUNT(*) FROM guards WHERE status = 'On Duty'"),
      pool.query('SELECT COUNT(*) FROM visitors'),
      pool.query("SELECT COUNT(*) FROM visitors WHERE status = 'Checked In'"),
      pool.query('SELECT COUNT(*) FROM tenants'),
      pool.query('SELECT COUNT(*) FROM credentials'),
      pool.query('SELECT COUNT(*) FROM work_orders'),
      pool.query('SELECT COUNT(*) FROM zones'),
      pool.query("SELECT COUNT(*) FROM devices").catch(() => ({ rows: [{ count: 0 }] })),
      pool.query("SELECT COUNT(*) FROM devices WHERE status = 'Online'").catch(() => ({ rows: [{ count: 0 }] })),
      pool.query("SELECT device_type, COUNT(*) as count FROM devices GROUP BY device_type ORDER BY count DESC").catch(() => ({ rows: [] })),
      pool.query("SELECT status, COUNT(*) as count FROM devices GROUP BY status ORDER BY count DESC").catch(() => ({ rows: [] })),
    ]);

    const camerasByStatus = {};
    const camResult = await pool.query("SELECT status, COUNT(*) as count FROM cameras GROUP BY status");
    camResult.rows.forEach(r => { camerasByStatus[r.status] = parseInt(r.count); });

    res.json({
      properties: parseInt(properties.rows[0].count),
      cameras: parseInt(cameras.rows[0].count),
      camerasOnline: parseInt(camerasOnline.rows[0].count),
      camerasOffline: parseInt(camerasOffline.rows[0].count),
      camerasByStatus,
      openIncidents: parseInt(incidents.rows[0].count),
      incidentsBySeverity: incidentsBySeverity.rows.reduce((acc, r) => { acc[r.severity] = parseInt(r.count); return acc; }, {}),
      accessEvents: parseInt(accessEvents.rows[0].count),
      accessGranted: parseInt(accessGranted.rows[0].count),
      accessDenied: parseInt(accessDenied.rows[0].count),
      guards: parseInt(guards.rows[0].count),
      guardsOnDuty: parseInt(guardsOnDuty.rows[0].count),
      visitors: parseInt(visitors.rows[0].count),
      visitorsCheckedIn: parseInt(visitorsCheckedIn.rows[0].count),
      tenants: parseInt(tenants.rows[0].count),
      credentials: parseInt(credentials.rows[0].count),
      workOrders: parseInt(workOrders.rows[0].count),
      zones: parseInt(zones.rows[0].count),
      devices: parseInt(devicesTotal.rows[0].count),
      devicesOnline: parseInt(devicesOnline.rows[0].count),
      devicesByType: devicesByType.rows,
      devicesByStatus: devicesByStatus.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Device Registry Endpoints (before generic CRUD to avoid /:id conflicts) ──
app.post('/api/devices/register', auth, async (req, res) => {
  try {
    const { name, device_type, ip_address, mac_address, firmware_version, manufacturer, model, property_name, zone_name, port, protocol, subnet } = req.body;
    if (!name || !device_type || !ip_address || !mac_address) {
      return res.status(400).json({ error: 'name, device_type, ip_address, mac_address are required' });
    }
    const existing = await pool.query('SELECT id FROM devices WHERE mac_address = $1', [mac_address]);
    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE devices SET name=$1, device_type=$2, ip_address=$3, firmware_version=$5, manufacturer=$6, model=$7,
         property_name=$8, zone_name=$9, port=$10, protocol=$11, subnet=$12, status='Online', last_seen=NOW()
         WHERE mac_address=$4 RETURNING *`,
        [name, device_type, ip_address, mac_address, firmware_version || null, manufacturer || null, model || null,
         property_name || null, zone_name || null, port || 443, protocol || 'HTTPS', subnet || null]
      );
    } else {
      result = await pool.query(
        `INSERT INTO devices (name, device_type, ip_address, mac_address, firmware_version, manufacturer, model,
         property_name, zone_name, port, protocol, subnet, status, last_seen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Online',NOW()) RETURNING *`,
        [name, device_type, ip_address, mac_address, firmware_version || null, manufacturer || null, model || null,
         property_name || null, zone_name || null, port || 443, protocol || 'HTTPS', subnet || null]
      );
    }
    io.emit('device-registered', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devices/heartbeat', auth, async (req, res) => {
  try {
    const { device_id, mac_address, cpu_usage, memory_usage, temperature, uptime_hours } = req.body;
    if (!device_id && !mac_address) {
      return res.status(400).json({ error: 'device_id or mac_address is required' });
    }
    const where = device_id ? 'id = $1' : 'mac_address = $1';
    const id = device_id || mac_address;
    const updates = ["last_seen = NOW()", "status = 'Online'"];
    const params = [id];
    let idx = 2;
    if (cpu_usage !== undefined) { updates.push(`cpu_usage = $${idx}`); params.push(cpu_usage); idx++; }
    if (memory_usage !== undefined) { updates.push(`memory_usage = $${idx}`); params.push(memory_usage); idx++; }
    if (temperature !== undefined) { updates.push(`temperature = $${idx}`); params.push(temperature); idx++; }
    if (uptime_hours !== undefined) { updates.push(`uptime_hours = $${idx}`); params.push(uptime_hours); idx++; }
    const result = await pool.query(`UPDATE devices SET ${updates.join(', ')} WHERE ${where} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    const device = result.rows[0];
    if ((cpu_usage && cpu_usage > 90) || (temperature && temperature > 75)) {
      const warning = cpu_usage > 90 ? `High CPU: ${cpu_usage}%` : `High Temperature: ${temperature}°C`;
      try {
        await pool.query(
          `INSERT INTO device_events (event_type, device_type, device_name, property_name, severity, description, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['health_warning', device.device_type, device.name, device.property_name, 'warning', warning, JSON.stringify({ cpu_usage, temperature })]
        );
      } catch (e) { /* best effort */ }
    }
    io.emit('device-heartbeat', device);
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/devices/network-scan', auth, async (req, res) => {
  try {
    const devices = await pool.query('SELECT * FROM devices ORDER BY subnet, ip_address');
    const subnets = {};
    for (const d of devices.rows) {
      const sub = d.subnet || 'Unknown';
      if (!subnets[sub]) {
        subnets[sub] = { subnet: sub, devices: [], online: 0, offline: 0, total: 0, health: 0, property: d.property_name };
      }
      subnets[sub].devices.push(d);
      subnets[sub].total++;
      if (d.status === 'Online') subnets[sub].online++;
      else subnets[sub].offline++;
    }
    for (const sub of Object.values(subnets)) {
      sub.health = sub.total > 0 ? Math.round((sub.online / sub.total) * 100) : 0;
    }
    res.json({ subnets: Object.values(subnets), scanned_at: new Date().toISOString(), total_devices: devices.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devices/:id/command', auth, async (req, res) => {
  try {
    const { command } = req.body;
    const validCommands = ['reboot', 'restart_service', 'update_firmware', 'capture_snapshot', 'lock_door', 'unlock_door', 'silence_alarm'];
    if (!command || !validCommands.includes(command)) {
      return res.status(400).json({ error: `Invalid command. Valid: ${validCommands.join(', ')}` });
    }
    const device = await pool.query('SELECT * FROM devices WHERE id = $1', [req.params.id]);
    if (device.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    const dev = device.rows[0];
    try {
      await pool.query(
        `INSERT INTO device_events (event_type, device_type, device_name, property_name, severity, description, metadata)
         VALUES ($1, $2, $3, $4, 'info', $5, $6)`,
        ['device_command', dev.device_type, dev.name, dev.property_name, `Command '${command}' executed`, JSON.stringify({ command })]
      );
    } catch (e) { /* best effort */ }
    if (command === 'reboot') {
      await pool.query("UPDATE devices SET uptime_hours = 0 WHERE id = $1", [req.params.id]);
    }
    const messages = {
      reboot: `Device ${dev.name} is rebooting...`,
      restart_service: `Service on ${dev.name} is restarting...`,
      update_firmware: `Firmware update initiated on ${dev.name}...`,
      capture_snapshot: `Snapshot captured from ${dev.name}`,
      lock_door: `Door locked at ${dev.name}`,
      unlock_door: `Door unlocked at ${dev.name}`,
      silence_alarm: `Alarm silenced on ${dev.name}`,
    };
    io.emit('device-command', { device_id: dev.id, command, message: messages[command] });
    res.json({ success: true, message: messages[command], device_id: dev.id, command });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Firmware Management ────────────────────────────────────────
app.get('/api/firmware/compliance', auth, async (req, res) => {
  try {
    const devs = await pool.query('SELECT * FROM devices');
    const catalog = await pool.query('SELECT * FROM firmware_catalog');
    const properties = {};
    for (const d of devs.rows) {
      const prop = d.property_name;
      if (!properties[prop]) properties[prop] = { property: prop, total: 0, current: 0, outdated: 0, critical: 0 };
      properties[prop].total++;
      const cat = catalog.rows.find(c => c.manufacturer === d.manufacturer && c.model === d.model);
      if (cat && d.firmware_version === cat.latest_version) { properties[prop].current++; }
      else { properties[prop].outdated++; if (cat && cat.severity === 'Critical') properties[prop].critical++; }
    }
    const summary = Object.values(properties);
    const total = summary.reduce((a, b) => a + b.total, 0);
    const current = summary.reduce((a, b) => a + b.current, 0);
    res.json({ total_devices: total, total_current: current, compliance_pct: total ? Math.round((current / total) * 100) : 0, by_property: summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/firmware/device-status', auth, async (req, res) => {
  try {
    const devs = await pool.query('SELECT * FROM devices ORDER BY id');
    const catalog = await pool.query('SELECT * FROM firmware_catalog');
    const updates = await pool.query("SELECT * FROM firmware_updates WHERE status NOT IN ('Completed','Failed') ORDER BY id");
    const result = devs.rows.map(d => {
      const cat = catalog.rows.find(c => c.manufacturer === d.manufacturer && c.model === d.model);
      const latestVer = cat ? cat.latest_version : d.firmware_version;
      const isCurrent = d.firmware_version === latestVer;
      const severity = cat ? (isCurrent ? 'Up-to-date' : cat.severity) : 'Up-to-date';
      const pendingUpdate = updates.rows.find(u => u.device_name === d.name);
      return { id: d.id, device_name: d.name, device_type: d.device_type, property_name: d.property_name, current_version: d.firmware_version, latest_version: latestVer, is_current: isCurrent, severity, manufacturer: d.manufacturer, pending_update: pendingUpdate || null };
    });
    res.json({ devices: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/firmware/initiate', auth, async (req, res) => {
  try {
    const { device_id, device_name, property_name, current_version, target_version } = req.body;
    const r = await pool.query(
      `INSERT INTO firmware_updates (device_id,device_name,property_name,current_version,target_version,status,progress,started_at,initiated_by) VALUES ($1,$2,$3,$4,$5,'Downloading',0,NOW(),$6) RETURNING *`,
      [device_id, device_name, property_name, current_version, target_version, 'admin@kastle.com']
    );
    const update = r.rows[0];
    let progress = 0;
    const interval = setInterval(async () => {
      progress += Math.floor(Math.random() * 15) + 10;
      if (progress >= 100) {
        progress = 100; clearInterval(interval);
        await pool.query("UPDATE firmware_updates SET progress=100,status='Completed',completed_at=NOW() WHERE id=$1", [update.id]);
        io.emit('firmware-complete', { id: update.id, device_name });
      } else {
        const status = progress < 50 ? 'Downloading' : 'Installing';
        await pool.query('UPDATE firmware_updates SET progress=$1,status=$2 WHERE id=$3', [progress, status, update.id]);
        io.emit('firmware-progress', { id: update.id, progress, status, device_name });
      }
    }, 2000);
    res.json({ update, message: 'Firmware update initiated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/firmware/schedule', auth, async (req, res) => {
  try {
    const { devices: devList, scheduled_at } = req.body;
    const results = [];
    for (const d of devList) {
      const r = await pool.query(
        `INSERT INTO firmware_updates (device_id,device_name,property_name,current_version,target_version,status,progress,scheduled_at,initiated_by) VALUES ($1,$2,$3,$4,$5,'Scheduled',0,$6,$7) RETURNING *`,
        [d.device_id, d.device_name, d.property_name, d.current_version, d.target_version, scheduled_at, 'admin@kastle.com']
      );
      results.push(r.rows[0]);
    }
    res.json({ updates: results, message: `${results.length} updates scheduled` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/firmware/updates/:id/cancel', auth, async (req, res) => {
  try {
    const r = await pool.query("UPDATE firmware_updates SET status='Cancelled' WHERE id=$1 AND status IN ('Pending','Scheduled') RETURNING *", [req.params.id]);
    if (r.rows.length === 0) return res.status(400).json({ error: 'Cannot cancel' });
    res.json({ update: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Network Topology ──────────────────────────────────────────
app.get('/api/topology/map', auth, async (req, res) => {
  try {
    const topo = await pool.query('SELECT * FROM network_topology ORDER BY property_name, subnet, id');
    const devs = await pool.query('SELECT * FROM devices ORDER BY id');
    const properties = {};
    for (const conn of topo.rows) {
      const prop = conn.property_name;
      if (!properties[prop]) properties[prop] = { name: prop, subnets: {}, uplinks: [] };
      if (conn.subnet === 'uplink') { properties[prop].uplinks.push(conn); continue; }
      const sub = conn.subnet;
      if (!properties[prop].subnets[sub]) properties[prop].subnets[sub] = { subnet: sub, switch_device: null, devices: [], health: 'Healthy' };
      if (!properties[prop].subnets[sub].switch_device) {
        const sw = devs.rows.find(d => d.name === conn.source_device_name);
        properties[prop].subnets[sub].switch_device = { id: conn.source_device_id, name: conn.source_device_name, status: sw ? sw.status : 'Unknown' };
      }
      const td = devs.rows.find(d => d.name === conn.target_device_name);
      properties[prop].subnets[sub].devices.push({
        id: conn.target_device_id, name: conn.target_device_name, connection_type: conn.connection_type,
        port: conn.port_number, bandwidth: conn.bandwidth_mbps, status: conn.status,
        device_type: td ? td.device_type : 'Unknown', health_status: td ? td.status : 'Unknown', firmware: td ? td.firmware_version : null,
      });
      if (conn.status === 'Down') properties[prop].subnets[sub].health = 'Critical';
      else if (conn.status === 'Degraded' && properties[prop].subnets[sub].health !== 'Critical') properties[prop].subnets[sub].health = 'Warning';
    }
    const result = Object.values(properties).map(p => ({ ...p, subnets: Object.values(p.subnets) }));
    const totalDevices = devs.rows.length;
    const onlineDevices = devs.rows.filter(d => d.status === 'Online').length;
    const activeConns = topo.rows.filter(t => t.status === 'Active').length;
    const alerts = topo.rows.filter(t => t.status === 'Degraded' || t.status === 'Down').length;
    res.json({ properties: result, summary: { total_properties: result.length, total_subnets: [...new Set(topo.rows.filter(t => t.subnet !== 'uplink').map(t => t.subnet))].length, total_devices: totalDevices, online_devices: onlineDevices, active_connections: activeConns, alerts, health_pct: totalDevices ? Math.round((onlineDevices / totalDevices) * 100) : 0 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/topology/property/:name', auth, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const topo = await pool.query('SELECT * FROM network_topology WHERE property_name=$1 OR property_name=$2 ORDER BY subnet,id', [name, 'Cross-Site']);
    const devs = await pool.query('SELECT * FROM devices WHERE property_name=$1', [name]);
    res.json({ connections: topo.rows, devices: devs.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Device Analytics ──────────────────────────────────────────
app.get('/api/analytics/overview', auth, async (req, res) => {
  try {
    const [healthScores, recentMetrics, alerts] = await Promise.all([
      pool.query('SELECT device_type, AVG(health_score) as avg_health, AVG(availability_pct) as avg_avail, SUM(alert_count) as total_alerts FROM device_health_scores WHERE score_date >= CURRENT_DATE - INTERVAL \'7 days\' GROUP BY device_type'),
      pool.query('SELECT AVG(cpu_usage) as avg_cpu, AVG(memory_usage) as avg_mem, AVG(temperature) as avg_temp, SUM(error_count) as total_errors FROM device_metrics WHERE recorded_at >= (SELECT MAX(recorded_at) FROM device_metrics) - INTERVAL \'24 hours\''),
      pool.query('SELECT score_date, SUM(alert_count) as daily_alerts FROM device_health_scores GROUP BY score_date ORDER BY score_date'),
    ]);
    const overallHealth = await pool.query('SELECT AVG(health_score) as fleet_health, AVG(availability_pct) as fleet_avail FROM device_health_scores WHERE score_date = (SELECT MAX(score_date) FROM device_health_scores)');
    const topAlerts = await pool.query('SELECT device_id, device_name, device_type, property_name, health_score, alert_count FROM device_health_scores WHERE score_date = (SELECT MAX(score_date) FROM device_health_scores) ORDER BY health_score ASC LIMIT 10');
    res.json({
      fleet_health: Math.round(parseFloat(overallHealth.rows[0]?.fleet_health || 0)),
      fleet_availability: parseFloat(overallHealth.rows[0]?.fleet_avail || 0).toFixed(1),
      avg_cpu: parseFloat(recentMetrics.rows[0]?.avg_cpu || 0).toFixed(1),
      avg_temperature: parseFloat(recentMetrics.rows[0]?.avg_temp || 0).toFixed(1),
      total_alerts_7d: alerts.rows.reduce((a, b) => a + parseInt(b.daily_alerts), 0),
      by_type: healthScores.rows.map(r => ({ device_type: r.device_type, avg_health: Math.round(parseFloat(r.avg_health)), avg_availability: parseFloat(r.avg_avail).toFixed(1), total_alerts: parseInt(r.total_alerts) })),
      alert_trend: alerts.rows.map(r => ({ date: r.score_date, alerts: parseInt(r.daily_alerts) })),
      attention_needed: topAlerts.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analytics/device/:id/metrics', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM device_metrics WHERE device_id = $1 ORDER BY recorded_at', [req.params.id]);
    res.json({ metrics: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analytics/device/:id/health', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM device_health_scores WHERE device_id = $1 ORDER BY score_date', [req.params.id]);
    res.json({ health: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analytics/property/:name', auth, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const [health, metrics] = await Promise.all([
      pool.query('SELECT device_name, device_type, AVG(health_score) as avg_health, AVG(availability_pct) as avg_avail, SUM(alert_count) as alerts FROM device_health_scores WHERE property_name = $1 GROUP BY device_name, device_type ORDER BY avg_health', [name]),
      pool.query('SELECT AVG(cpu_usage) as avg_cpu, AVG(memory_usage) as avg_mem, AVG(temperature) as avg_temp, SUM(error_count) as errors FROM device_metrics WHERE property_name = $1 AND recorded_at >= (SELECT MAX(recorded_at) FROM device_metrics) - INTERVAL \'24 hours\'', [name]),
    ]);
    res.json({ devices: health.rows, aggregates: metrics.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analytics/comparison', auth, async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').filter(Boolean).map(Number);
    if (ids.length === 0) {
      const byType = await pool.query('SELECT device_type, AVG(health_score) as avg_health, AVG(avg_cpu) as avg_cpu, AVG(avg_memory) as avg_mem, AVG(avg_temperature) as avg_temp FROM device_health_scores GROUP BY device_type');
      return res.json({ by_type: byType.rows });
    }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const r = await pool.query(`SELECT * FROM device_metrics WHERE device_id IN (${placeholders}) ORDER BY device_id, recorded_at`, ids);
    res.json({ metrics: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analytics/alerts', auth, async (req, res) => {
  try {
    const [byDay, byDevice, byType] = await Promise.all([
      pool.query('SELECT score_date as date, SUM(alert_count) as count FROM device_health_scores WHERE alert_count > 0 GROUP BY score_date ORDER BY score_date'),
      pool.query('SELECT device_name, device_type, SUM(alert_count) as count FROM device_health_scores WHERE alert_count > 0 GROUP BY device_name, device_type ORDER BY count DESC LIMIT 10'),
      pool.query('SELECT device_type as type, SUM(alert_count) as count FROM device_health_scores WHERE alert_count > 0 GROUP BY device_type ORDER BY count DESC'),
    ]);
    const timeline = await pool.query('SELECT device_name, device_type, property_name, score_date, alert_count, health_score FROM device_health_scores WHERE alert_count > 0 ORDER BY score_date DESC, alert_count DESC LIMIT 50');
    res.json({ by_day: byDay.rows, by_device: byDevice.rows, by_type: byType.rows, timeline: timeline.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Generic CRUD for all Modules ────────────────────────────────
const TABLES = ['properties', 'access_events', 'visitors', 'credentials', 'cameras', 'incidents', 'tenants', 'work_orders', 'zones', 'guards', 'device_events', 'devices', 'firmware_catalog', 'firmware_updates', 'network_topology', 'device_metrics', 'device_health_scores'];

for (const table of TABLES) {
  // List with search
  app.get(`/api/${table}`, auth, async (req, res) => {
    try {
      const { search, limit = 100, order = 'id DESC' } = req.query;
      let query = `SELECT * FROM ${table}`;
      const params = [];
      if (search) {
        const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND data_type IN ('character varying', 'text')`, [table]);
        const conditions = cols.rows.map((c, i) => `${c.column_name}::text ILIKE $${i + 1}`);
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' OR ')}`;
          cols.rows.forEach(() => params.push(`%${search}%`));
        }
      }
      // Sanitize order to prevent SQL injection
      const allowedOrders = /^[a-z_]+ (ASC|DESC)$/i;
      const safeOrder = allowedOrders.test(order) ? order : 'id DESC';
      query += ` ORDER BY ${safeOrder} LIMIT ${parseInt(limit)}`;
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single
  app.get(`/api/${table}/:id`, auth, async (req, res) => {
    try {
      const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create
  app.post(`/api/${table}`, auth, async (req, res) => {
    try {
      const keys = Object.keys(req.body).filter(k => k !== 'id' && k !== 'created_at');
      const vals = keys.map(k => req.body[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      const result = await pool.query(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
        vals
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update
  app.put(`/api/${table}/:id`, auth, async (req, res) => {
    try {
      const keys = Object.keys(req.body).filter(k => k !== 'id' && k !== 'created_at');
      const vals = keys.map(k => req.body[k]);
      const sets = keys.map((k, i) => `${k} = $${i + 1}`);
      vals.push(req.params.id);
      const result = await pool.query(
        `UPDATE ${table} SET ${sets.join(',')} WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete
  app.delete(`/api/${table}/:id`, auth, async (req, res) => {
    try {
      const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Deleted', record: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── OpenRouter AI Helper ───────────────────────────────────────
async function callAI(messages, maxTokens = 2000) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_tokens: maxTokens }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.choices[0].message.content;
}

// ─── AI Endpoint 1: SOC Copilot ─────────────────────────────────
app.post('/api/ai/soc-copilot', auth, async (req, res) => {
  try {
    const { messages: userMessages } = req.body;
    const [props, incs, events, cams, gds] = await Promise.all([
      pool.query('SELECT name, city, status FROM properties LIMIT 20'),
      pool.query('SELECT incident_number, title, severity, status, property_name FROM incidents ORDER BY id DESC LIMIT 10'),
      pool.query('SELECT person_name, property_name, status, door_name, timestamp FROM access_events ORDER BY id DESC LIMIT 10'),
      pool.query("SELECT name, property_name, status FROM cameras WHERE status != 'Online' LIMIT 10"),
      pool.query("SELECT full_name, property_name, shift, status FROM guards WHERE status = 'On Duty' LIMIT 10"),
    ]);
    const systemMsg = `You are the Kastle Systems SOC (Security Operations Center) Copilot AI assistant. You help security operators monitor and manage building security across a portfolio of commercial properties.

Current Data Context:
- Properties: ${JSON.stringify(props.rows)}
- Recent Incidents: ${JSON.stringify(incs.rows)}
- Recent Access Events: ${JSON.stringify(events.rows)}
- Cameras Needing Attention: ${JSON.stringify(cams.rows)}
- Guards On Duty: ${JSON.stringify(gds.rows)}

Respond concisely and professionally. Use markdown formatting with headers, bullets, and bold for emphasis. When discussing security issues, always recommend actionable next steps.`;

    const aiMessages = [{ role: 'system', content: systemMsg }, ...userMessages];
    const answer = await callAI(aiMessages);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 2: Incident Summarizer ─────────────────────────
app.post('/api/ai/incident-summarizer', auth, async (req, res) => {
  try {
    const incidents = await pool.query('SELECT * FROM incidents ORDER BY id DESC');
    const events = await pool.query('SELECT * FROM access_events ORDER BY timestamp DESC LIMIT 30');
    const answer = await callAI([
      { role: 'system', content: 'You are a security incident analyst for Kastle Systems. Analyze incidents and provide professional summaries with severity assessments, patterns, and recommended actions. Use markdown formatting.' },
      { role: 'user', content: `Analyze these security incidents and related access events:\n\nIncidents:\n${JSON.stringify(incidents.rows)}\n\nRecent Access Events:\n${JSON.stringify(events.rows)}\n\n${req.body.prompt || 'Provide a comprehensive incident summary with patterns and recommendations.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 3: Anomaly Detection ───────────────────────────
app.post('/api/ai/anomaly-detection', auth, async (req, res) => {
  try {
    const denied = await pool.query("SELECT * FROM access_events WHERE status = 'Denied'");
    const offHours = await pool.query("SELECT * FROM access_events WHERE EXTRACT(HOUR FROM timestamp) < 6 OR EXTRACT(HOUR FROM timestamp) > 22");
    const allEvents = await pool.query('SELECT * FROM access_events ORDER BY timestamp DESC');
    const answer = await callAI([
      { role: 'system', content: 'You are an AI anomaly detection system for Kastle Systems. Analyze access patterns and identify anomalies. Rate each anomaly as Critical, High, Medium, or Low. Use markdown formatting with clear sections.' },
      { role: 'user', content: `Analyze these access events for anomalies:\n\nDenied Access Events:\n${JSON.stringify(denied.rows)}\n\nOff-Hours Events:\n${JSON.stringify(offHours.rows)}\n\nAll Events:\n${JSON.stringify(allEvents.rows)}\n\n${req.body.prompt || 'Identify all anomalies and rate their severity.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 4: Visitor Risk Assessment ─────────────────────
app.post('/api/ai/visitor-risk', auth, async (req, res) => {
  try {
    const visitors = await pool.query('SELECT * FROM visitors ORDER BY check_in DESC');
    const incidents = await pool.query('SELECT property_name, severity, incident_type, title FROM incidents');
    const answer = await callAI([
      { role: 'system', content: 'You are a visitor risk assessment AI for Kastle Systems. Evaluate visitor risk based on patterns, property incident history, and visit details. Assign risk scores (1-100) and flag concerning patterns. Use markdown formatting.' },
      { role: 'user', content: `Assess visitor risk:\n\nVisitors:\n${JSON.stringify(visitors.rows)}\n\nProperty Incidents:\n${JSON.stringify(incidents.rows)}\n\n${req.body.prompt || 'Provide risk assessment for all current visitors.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 5: Natural Language Reporting ──────────────────
app.post('/api/ai/nl-reporting', auth, async (req, res) => {
  try {
    const [props, events, visitors, creds, cams, incs, tenants, wos, zones, guards] = await Promise.all([
      pool.query('SELECT * FROM properties'),
      pool.query('SELECT * FROM access_events'),
      pool.query('SELECT * FROM visitors'),
      pool.query('SELECT * FROM credentials'),
      pool.query('SELECT * FROM cameras'),
      pool.query('SELECT * FROM incidents'),
      pool.query('SELECT * FROM tenants'),
      pool.query('SELECT * FROM work_orders'),
      pool.query('SELECT * FROM zones'),
      pool.query('SELECT * FROM guards'),
    ]);
    const answer = await callAI([
      { role: 'system', content: `You are a natural language reporting engine for Kastle Systems. Answer questions using this data. Be precise with numbers. Use markdown tables when appropriate.

Data:
- Properties (${props.rows.length}): ${JSON.stringify(props.rows)}
- Access Events (${events.rows.length}): ${JSON.stringify(events.rows)}
- Visitors (${visitors.rows.length}): ${JSON.stringify(visitors.rows)}
- Credentials (${creds.rows.length}): ${JSON.stringify(creds.rows)}
- Cameras (${cams.rows.length}): ${JSON.stringify(cams.rows)}
- Incidents (${incs.rows.length}): ${JSON.stringify(incs.rows)}
- Tenants (${tenants.rows.length}): ${JSON.stringify(tenants.rows)}
- Work Orders (${wos.rows.length}): ${JSON.stringify(wos.rows)}
- Zones (${zones.rows.length}): ${JSON.stringify(zones.rows)}
- Guards (${guards.rows.length}): ${JSON.stringify(guards.rows)}` },
      { role: 'user', content: req.body.prompt || 'Give me an overview of the entire security portfolio.' }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 6: Compliance Report ───────────────────────────
app.post('/api/ai/compliance-report', auth, async (req, res) => {
  try {
    const [events, creds, cams, incs, zones] = await Promise.all([
      pool.query('SELECT * FROM access_events'),
      pool.query('SELECT * FROM credentials'),
      pool.query('SELECT * FROM cameras'),
      pool.query('SELECT * FROM incidents'),
      pool.query('SELECT * FROM zones'),
    ]);
    const answer = await callAI([
      { role: 'system', content: 'You are a compliance reporting AI for Kastle Systems. Generate SOC 2 and HIPAA compliance assessments based on security data. Identify gaps and provide recommendations. Use markdown with clear sections, checkmarks for compliant items, and X marks for non-compliant items.' },
      { role: 'user', content: `Generate a compliance report based on:\n\nAccess Events: ${JSON.stringify(events.rows)}\nCredentials: ${JSON.stringify(creds.rows)}\nCameras: ${JSON.stringify(cams.rows)}\nIncidents: ${JSON.stringify(incs.rows)}\nZones: ${JSON.stringify(zones.rows)}\n\n${req.body.prompt || 'Generate a comprehensive SOC 2 compliance report.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 7: Predictive Maintenance ──────────────────────
app.post('/api/ai/predictive-maintenance', auth, async (req, res) => {
  try {
    const wos = await pool.query('SELECT * FROM work_orders ORDER BY created_at DESC');
    const cams = await pool.query('SELECT * FROM cameras');
    const answer = await callAI([
      { role: 'system', content: 'You are a predictive maintenance AI for Kastle Systems. Analyze work order history and device status to predict failures and recommend preventive maintenance. Use markdown formatting.' },
      { role: 'user', content: `Analyze maintenance data:\n\nWork Orders: ${JSON.stringify(wos.rows)}\nCameras: ${JSON.stringify(cams.rows)}\n\n${req.body.prompt || 'Predict upcoming device failures and recommend maintenance actions.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 8: Threat Assessment ───────────────────────────
app.post('/api/ai/threat-assessment', auth, async (req, res) => {
  try {
    const propertyName = req.body.property;
    let incs, cams, zones, guards, events;
    if (propertyName) {
      [incs, cams, zones, guards, events] = await Promise.all([
        pool.query('SELECT * FROM incidents WHERE property_name = $1', [propertyName]),
        pool.query('SELECT * FROM cameras WHERE property_name = $1', [propertyName]),
        pool.query('SELECT * FROM zones WHERE property_name = $1', [propertyName]),
        pool.query('SELECT * FROM guards WHERE property_name = $1', [propertyName]),
        pool.query('SELECT * FROM access_events WHERE property_name = $1', [propertyName]),
      ]);
    } else {
      [incs, cams, zones, guards, events] = await Promise.all([
        pool.query('SELECT * FROM incidents'),
        pool.query('SELECT * FROM cameras'),
        pool.query('SELECT * FROM zones'),
        pool.query('SELECT * FROM guards'),
        pool.query('SELECT * FROM access_events'),
      ]);
    }
    const answer = await callAI([
      { role: 'system', content: 'You are a threat assessment AI for Kastle Systems. Evaluate security posture and provide threat scores (1-100), identify vulnerabilities, and recommend improvements. Use markdown formatting.' },
      { role: 'user', content: `Assess threats for ${propertyName || 'all properties'}:\n\nIncidents: ${JSON.stringify(incs.rows)}\nCameras: ${JSON.stringify(cams.rows)}\nZones: ${JSON.stringify(zones.rows)}\nGuards: ${JSON.stringify(guards.rows)}\nAccess Events: ${JSON.stringify(events.rows)}\n\n${req.body.prompt || 'Provide a comprehensive threat assessment with security score.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 9: Access Pattern Analysis ─────────────────────
app.post('/api/ai/access-pattern-analysis', auth, async (req, res) => {
  try {
    const events = await pool.query('SELECT * FROM access_events ORDER BY timestamp');
    const answer = await callAI([
      { role: 'system', content: 'You are an access pattern analysis AI for Kastle Systems. Analyze traffic flow, peak hours, door utilization, and provide optimization recommendations. Use markdown with tables and clear sections.' },
      { role: 'user', content: `Analyze access patterns:\n\n${JSON.stringify(events.rows)}\n\n${req.body.prompt || 'Analyze traffic flow patterns, peak hours, and provide optimization recommendations.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 10: Smart Scheduling ───────────────────────────
app.post('/api/ai/smart-scheduling', auth, async (req, res) => {
  try {
    const guards = await pool.query('SELECT * FROM guards');
    const incidents = await pool.query('SELECT * FROM incidents');
    const events = await pool.query('SELECT * FROM access_events');
    const answer = await callAI([
      { role: 'system', content: 'You are a smart scheduling AI for Kastle Systems. Optimize guard shift assignments based on incident patterns, access volume, and risk levels. Use markdown formatting with proposed schedules.' },
      { role: 'user', content: `Optimize guard scheduling:\n\nGuards: ${JSON.stringify(guards.rows)}\nIncidents: ${JSON.stringify(incidents.rows)}\nAccess Events: ${JSON.stringify(events.rows)}\n\n${req.body.prompt || 'Recommend optimized guard scheduling based on risk patterns.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 11: Device Health Advisor ───────────────────────
app.post('/api/ai/device-health-advisor', auth, async (req, res) => {
  try {
    const [metrics, health, devices] = await Promise.all([
      pool.query('SELECT * FROM device_metrics ORDER BY recorded_at DESC LIMIT 200'),
      pool.query('SELECT * FROM device_health_scores ORDER BY score_date DESC'),
      pool.query('SELECT * FROM devices'),
    ]);
    const answer = await callAI([
      { role: 'system', content: 'You are a device health advisor for Kastle Systems. Analyze device metrics and health score trends to identify devices heading toward failure. Flag declining health scores, high CPU/memory/temperature trends, and rising error counts. Recommend proactive actions for each at-risk device. Use markdown formatting with clear severity ratings.' },
      { role: 'user', content: `Analyze device health data:\n\nDevices:\n${JSON.stringify(devices.rows)}\n\nRecent Metrics (last 200 readings):\n${JSON.stringify(metrics.rows)}\n\nHealth Scores:\n${JSON.stringify(health.rows)}\n\n${req.body.prompt || 'Identify devices at risk of failure, explain why their health is declining, and recommend proactive actions.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 12: Firmware Risk Analyzer ──────────────────────
app.post('/api/ai/firmware-risk-analyzer', auth, async (req, res) => {
  try {
    const [devices, catalog, updates] = await Promise.all([
      pool.query('SELECT * FROM devices ORDER BY id'),
      pool.query('SELECT * FROM firmware_catalog'),
      pool.query('SELECT * FROM firmware_updates ORDER BY created_at DESC'),
    ]);
    const answer = await callAI([
      { role: 'system', content: 'You are a firmware risk analyst for Kastle Systems. Analyze firmware versions against the catalog to identify CVE exposure and outdated devices. Review failed updates to explain root causes. Prioritize firmware rollout by criticality and property. Use markdown formatting with tables for rollout priority and clear risk ratings (Critical/High/Medium/Low).' },
      { role: 'user', content: `Analyze firmware risk:\n\nDevices:\n${JSON.stringify(devices.rows)}\n\nFirmware Catalog (latest versions):\n${JSON.stringify(catalog.rows)}\n\nUpdate History:\n${JSON.stringify(updates.rows)}\n\n${req.body.prompt || 'Identify devices with critical firmware vulnerabilities, explain failed updates, and recommend a prioritized rollout plan.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 13: Network Health Diagnostics ──────────────────
app.post('/api/ai/network-health-diagnostics', auth, async (req, res) => {
  try {
    const [topology, devices] = await Promise.all([
      pool.query('SELECT * FROM network_topology ORDER BY property_name, subnet, id'),
      pool.query('SELECT * FROM devices ORDER BY id'),
    ]);
    const answer = await callAI([
      { role: 'system', content: 'You are a network health diagnostician for Kastle Systems. Analyze network topology and device status to identify subnet bottlenecks, single points of failure, offline connection chains, and degraded links. Recommend network improvements, redundancy additions, and priority fixes. Use markdown formatting with clear sections per property/subnet.' },
      { role: 'user', content: `Analyze network health:\n\nNetwork Topology:\n${JSON.stringify(topology.rows)}\n\nDevices:\n${JSON.stringify(devices.rows)}\n\n${req.body.prompt || 'Identify network issues including single points of failure, offline chains, degraded connections, and recommend improvements.'}` }
    ]);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Endpoint 14: Device Intelligence Copilot ─────────────────
app.post('/api/ai/device-copilot', auth, async (req, res) => {
  try {
    const { messages: userMessages } = req.body;
    const [devices, metrics, health, catalog, updates, topology, events] = await Promise.all([
      pool.query('SELECT * FROM devices'),
      pool.query('SELECT * FROM device_metrics ORDER BY recorded_at DESC LIMIT 100'),
      pool.query('SELECT * FROM device_health_scores ORDER BY score_date DESC LIMIT 100'),
      pool.query('SELECT * FROM firmware_catalog'),
      pool.query('SELECT * FROM firmware_updates ORDER BY created_at DESC LIMIT 30'),
      pool.query('SELECT * FROM network_topology'),
      pool.query('SELECT * FROM device_events ORDER BY created_at DESC LIMIT 20'),
    ]);
    const systemMsg = `You are the Kastle Systems Device Intelligence Copilot. You help operators understand and manage all hardware infrastructure — devices, firmware, network topology, and health metrics.

Current Data Context:
- Devices: ${JSON.stringify(devices.rows)}
- Recent Metrics (last 100): ${JSON.stringify(metrics.rows)}
- Health Scores (last 100): ${JSON.stringify(health.rows)}
- Firmware Catalog: ${JSON.stringify(catalog.rows)}
- Recent Firmware Updates: ${JSON.stringify(updates.rows)}
- Network Topology: ${JSON.stringify(topology.rows)}
- Recent Device Events: ${JSON.stringify(events.rows)}

Respond concisely and professionally. Use markdown formatting. When discussing issues, always recommend actionable next steps.`;

    const aiMessages = [{ role: 'system', content: systemMsg }, ...userMessages];
    const answer = await callAI(aiMessages);
    res.json({ response: answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Device Simulator ───────────────────────────────────────────
let simulatorInterval = null;
let simulatorRunning = false;
let simCache = { properties: [], zones: [], cameras: [], devices: [] };

async function loadSimCache() {
  try {
    const props = await pool.query('SELECT name FROM properties');
    simCache.properties = props.rows.map(r => r.name);
    const z = await pool.query('SELECT name, property_name FROM zones');
    simCache.zones = z.rows;
    const c = await pool.query('SELECT name, property_name FROM cameras');
    simCache.cameras = c.rows;
    simCache.devices = [
      ...c.rows.map(r => ({ type: 'Camera', name: r.name, property: r.property_name })),
      { type: 'Reader', name: 'RDR-MAIN-ENTRY', property: simCache.properties[0] || 'Building A' },
      { type: 'Reader', name: 'RDR-WIL-4A', property: 'Willis Tower' },
      { type: 'Reader', name: 'RDR-SF-35', property: 'Salesforce Tower' },
      { type: 'Reader', name: 'RDR-BOA-01', property: 'Bank of America Plaza' },
      { type: 'Controller', name: 'CTRL-SF-35', property: 'Salesforce Tower' },
      { type: 'Controller', name: 'CTRL-WIL-01', property: 'Willis Tower' },
      { type: 'Sensor', name: 'SMK-REN-40', property: 'Renaissance Center' },
      { type: 'Sensor', name: 'VIB-REP-01', property: 'Republic Plaza' },
      { type: 'Alarm Panel', name: 'ALM-KEY-01', property: 'Key Tower' },
      { type: 'Alarm Panel', name: 'ALM-REN-01', property: 'Renaissance Center' },
    ];
    console.log('Simulator cache loaded:', simCache.properties.length, 'properties,', simCache.devices.length, 'devices');
  } catch (e) { console.log('Sim cache note:', e.message); }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function genEvent() {
  const roll = Math.random();
  const prop = pick(simCache.properties) || 'One World Trade Center';
  const zone = simCache.zones.find(z => z.property_name === prop);
  const zoneName = zone ? zone.name : 'Main Lobby';
  if (roll < 0.4) {
    const granted = Math.random() > 0.25;
    const reader = pick(simCache.devices.filter(d => d.type === 'Reader')) || { name: 'RDR-MAIN-ENTRY', property: prop };
    const names = ['John Smith', 'Maria Santos', 'Derek Williams', 'Sarah Chen', 'Tom Reynolds', 'Angela Wright'];
    const badge = String(1000 + Math.floor(Math.random() * 9000));
    return { event_type: granted ? 'access_granted' : 'access_denied', device_type: 'Reader', device_name: reader.name, property_name: reader.property || prop, zone_name: zoneName, severity: granted ? 'info' : 'warning', description: granted ? `Badge access granted - ${pick(names)} (Badge #${badge})` : `Access denied - ${pick(['expired credential', 'unauthorized area', 'invalid badge'])}`, metadata: JSON.stringify({ badge_number: badge, holder: pick(names) }) };
  } else if (roll < 0.65) {
    const cam = pick(simCache.devices.filter(d => d.type === 'Camera')) || { name: 'CAM-WTC-001', property: prop };
    return { event_type: 'camera_motion', device_type: 'Camera', device_name: cam.name, property_name: cam.property || prop, zone_name: zoneName, severity: Math.random() > 0.8 ? 'warning' : 'info', description: `Motion detected - ${pick(['Normal foot traffic', 'Delivery detected', 'Unknown person loitering', 'Vehicle entering'])}`, metadata: JSON.stringify({ confidence: +(0.75 + Math.random() * 0.24).toFixed(2) }) };
  } else if (roll < 0.8) {
    const sensor = pick(simCache.devices.filter(d => d.type === 'Sensor')) || { name: 'SMK-REN-40', property: prop };
    const st = pick(['smoke', 'temperature', 'vibration', 'glass_break']);
    return { event_type: 'sensor_triggered', device_type: 'Sensor', device_name: sensor.name, property_name: sensor.property || prop, zone_name: zoneName, severity: Math.random() > 0.6 ? 'critical' : 'warning', description: `${st} sensor triggered - investigating`, metadata: JSON.stringify({ sensor_subtype: st, reading: +(Math.random() * 100).toFixed(1) }) };
  } else if (roll < 0.9) {
    const dev = pick(simCache.devices) || { type: 'Camera', name: 'CAM-WTC-001', property: prop };
    const online = Math.random() > 0.4;
    return { event_type: online ? 'device_online' : 'health_warning', device_type: dev.type, device_name: dev.name, property_name: dev.property || prop, zone_name: zoneName, severity: online ? 'info' : 'warning', description: online ? `${dev.name} back online` : `${dev.name} degraded performance`, metadata: JSON.stringify({ metric: pick(['cpu', 'temperature', 'signal']), value: +(Math.random() * 100).toFixed(1) }) };
  } else {
    const alarm = pick(simCache.devices.filter(d => d.type === 'Alarm Panel')) || { name: 'ALM-KEY-01', property: prop };
    const triggered = Math.random() > 0.5;
    return { event_type: triggered ? 'alarm_triggered' : 'alarm_cleared', device_type: 'Alarm Panel', device_name: alarm.name, property_name: alarm.property || prop, zone_name: zoneName, severity: triggered ? 'critical' : 'info', description: triggered ? `Alarm triggered - ${pick(['intrusion detected', 'fire alarm', 'panic button', 'perimeter breach'])}` : `Alarm cleared - ${pick(['false alarm', 'resolved', 'test completed'])}`, metadata: JSON.stringify({ alarm_zone: `Zone-${String.fromCharCode(65 + Math.floor(Math.random() * 6))}` }) };
  }
}

async function simTick() {
  try {
    const evt = genEvent();
    const r = await pool.query(`INSERT INTO device_events (event_type, device_type, device_name, property_name, zone_name, severity, description, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [evt.event_type, evt.device_type, evt.device_name, evt.property_name, evt.zone_name, evt.severity, evt.description, evt.metadata]);
    io.emit('device-event', r.rows[0]);
  } catch (e) { console.log('Sim tick error:', e.message); }
}

app.get('/api/simulator/status', auth, (req, res) => { res.json({ running: simulatorRunning }); });
app.post('/api/simulator/toggle', auth, (req, res) => {
  if (simulatorRunning) { clearInterval(simulatorInterval); simulatorInterval = null; simulatorRunning = false; res.json({ running: false }); }
  else { simulatorInterval = setInterval(simTick, 5000); simulatorRunning = true; res.json({ running: true }); }
});

// ─── Webhook Endpoints ──────────────────────────────────────────
app.post('/api/webhooks/device-event', auth, async (req, res) => {
  try {
    const { event_type, device_type, device_name, property_name, zone_name, severity, description, metadata } = req.body;
    if (!event_type || !device_type || !device_name || !property_name) return res.status(400).json({ error: 'Missing required fields: event_type, device_type, device_name, property_name' });
    const r = await pool.query(`INSERT INTO device_events (event_type, device_type, device_name, property_name, zone_name, severity, description, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [event_type, device_type, device_name, property_name, zone_name || null, severity || 'info', description || '', JSON.stringify(metadata || {})]);
    io.emit('device-event', r.rows[0]);
    res.status(201).json({ success: true, event: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/webhooks/sensor-trigger', auth, async (req, res) => {
  try {
    const { sensor_type, zone_name, property_name, severity, description, device_name } = req.body;
    if (!sensor_type || !zone_name || !property_name || !severity) return res.status(400).json({ error: 'Missing required fields: sensor_type, zone_name, property_name, severity' });
    const r = await pool.query(`INSERT INTO device_events (event_type, device_type, device_name, property_name, zone_name, severity, description, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      ['sensor_triggered', 'Sensor', device_name || `SNS-${sensor_type.toUpperCase().slice(0,3)}`, property_name, zone_name, severity, description || `${sensor_type} sensor triggered`, JSON.stringify({ sensor_type })]);
    io.emit('device-event', r.rows[0]);
    res.status(201).json({ success: true, event: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/webhooks/health-heartbeat', auth, async (req, res) => {
  try {
    const { device_type, device_name, property_name, metric_type, metric_value } = req.body;
    if (!device_type || !device_name || !property_name || !metric_type || metric_value === undefined) return res.status(400).json({ error: 'Missing required fields: device_type, device_name, property_name, metric_type, metric_value' });
    const sev = metric_value > 90 ? 'critical' : metric_value > 75 ? 'warning' : 'info';
    const r = await pool.query(`INSERT INTO device_events (event_type, device_type, device_name, property_name, severity, description, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [sev === 'info' ? 'device_online' : 'health_warning', device_type, device_name, property_name, sev, `Health heartbeat: ${metric_type} = ${metric_value}`, JSON.stringify({ metric_type, metric_value })]);
    io.emit('device-event', r.rows[0]);
    res.status(201).json({ success: true, event: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AI Threat Analyzer ─────────────────────────────────────────
app.post('/api/ai/threat-analyzer', auth, async (req, res) => {
  try {
    const events = await pool.query('SELECT * FROM device_events ORDER BY created_at DESC LIMIT 20');
    const incidents = await pool.query("SELECT * FROM incidents WHERE status != 'Resolved' ORDER BY created_at DESC LIMIT 5");
    const answer = await callAI([
      { role: 'system', content: 'You are a SOC threat analyzer. Be concise. Use markdown headers and bullet points.' },
      { role: 'user', content: `Quick threat assessment:\n1. Threat Level (Low/Medium/High/Critical)\n2. Top 3 threats\n3. Key patterns\n4. Immediate actions\n\nEVENTS:\n${events.rows.map(e => `[${e.severity}] ${e.event_type} - ${e.device_name} @ ${e.property_name}`).join('\n')}\n\nINCIDENTS:\n${incidents.rows.map(i => `[${i.severity}] ${i.title}`).join('\n')}` }
    ], 1500);
    res.json({ response: answer });
  } catch (err) {
    console.error('Threat analyzer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/telemetry', require('./routes/telemetryIngest')); app.use('/api/soc-triage', require('./routes/socTriage')); app.use('/api/firmware-cve', require('./routes/firmwareCVE')); app.use('/api/identity-analytics', require('./routes/identityAnalytics')); app.use('/api/device-adapter', require('./routes/deviceAdapter'));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'kastle-backend', ts: Date.now() }));

// Custom Views — mount BEFORE any 404 handler
app.use('/api/custom-views', require('./routes/customViews'));

// 404 fallback for unknown /api/* routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found', path: req.originalUrl }));

// ─── Socket.IO ──────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('SOC client connected:', socket.id);
  socket.on('disconnect', () => console.log('SOC client disconnected:', socket.id));
});

// ─── Start Server ───────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🔒 Kastle Backend running on http://localhost:${PORT}`);
  loadSimCache();
});
