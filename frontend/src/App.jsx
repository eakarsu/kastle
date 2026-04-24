import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { FaTachometerAlt, FaBrain, FaSignOutAlt, FaDesktop, FaNetworkWired, FaMicrochip, FaSitemap, FaChartLine } from 'react-icons/fa';
import { isAuthenticated, logout } from './api';
import { modules, moduleGroups } from './modules';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ModulePage from './pages/ModulePage';
import DetailPage from './pages/DetailPage';
import AIInsights from './pages/AIInsights';
import SOCDashboard from './pages/SOCDashboard';
import DeviceRegistry from './pages/DeviceRegistry';
import FirmwareManagement from './pages/FirmwareManagement';
import NetworkTopology from './pages/NetworkTopology';
import DeviceAnalytics from './pages/DeviceAnalytics';

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return children;
}

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState('Admin');

  useEffect(() => {
    try {
      const token = localStorage.getItem('kastle_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserName(payload.full_name || 'Admin');
      }
    } catch {}
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">K</div>
          <div>
            <h1>KASTLE</h1>
            <small>Security Operations</small>
          </div>
        </div>

        <div className="sidebar-group">
          <Link to="/dashboard" className={`sidebar-link ${isActive('/dashboard') ? 'active' : ''}`}>
            <FaTachometerAlt /> Dashboard
          </Link>
        </div>

        {moduleGroups.map(group => (
          <div className="sidebar-group" key={group.name}>
            <div className="sidebar-group-label">{group.name}</div>
            {group.keys.map(key => {
              const mod = modules.find(m => m.key === key);
              if (!mod) return null;
              const Icon = mod.icon;
              return (
                <Link
                  key={key}
                  to={`/module/${key}`}
                  className={`sidebar-link ${isActive(`/module/${key}`) ? 'active' : ''}`}
                >
                  <Icon /> {mod.name}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="sidebar-group">
          <div className="sidebar-group-label">Intelligence</div>
          <Link to="/ai" className={`sidebar-link ${isActive('/ai') ? 'active' : ''}`}>
            <FaBrain /> AI Insights
          </Link>
          <Link to="/soc" className={`sidebar-link ${isActive('/soc') ? 'active' : ''}`}>
            <FaDesktop /> SOC Dashboard
          </Link>
        </div>

        <div className="sidebar-group">
          <div className="sidebar-group-label">Hardware Intelligence</div>
          <Link to="/devices" className={`sidebar-link ${isActive('/devices') ? 'active' : ''}`}>
            <FaNetworkWired /> Device Registry
          </Link>
          <Link to="/firmware" className={`sidebar-link ${isActive('/firmware') ? 'active' : ''}`}>
            <FaMicrochip /> Firmware Mgmt
          </Link>
          <Link to="/topology" className={`sidebar-link ${isActive('/topology') ? 'active' : ''}`}>
            <FaSitemap /> Network Topology
          </Link>
          <Link to="/analytics" className={`sidebar-link ${isActive('/analytics') ? 'active' : ''}`}>
            <FaChartLine /> Device Analytics
          </Link>
        </div>

        <div className="sidebar-bottom">
          <button className="sidebar-link" onClick={handleLogout}>
            <FaSignOutAlt /> Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div className="topbar-title">
            {location.pathname === '/dashboard' && 'Dashboard'}
            {location.pathname.startsWith('/module/') && (() => {
              const key = location.pathname.split('/')[2];
              const mod = modules.find(m => m.key === key);
              return mod ? mod.name : '';
            })()}
            {location.pathname === '/ai' && 'AI Insights'}
            {location.pathname === '/soc' && 'SOC Dashboard'}
            {location.pathname === '/devices' && 'Device Registry'}
            {location.pathname === '/firmware' && 'Firmware Management'}
            {location.pathname === '/topology' && 'Network Topology'}
            {location.pathname === '/analytics' && 'Device Analytics'}
          </div>
          <div className="topbar-user">
            <span>{userName}</span>
            <button onClick={handleLogout}>Sign Out</button>
          </div>
        </div>
        <div className="page-content">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/module/:name" element={<ModulePage />} />
            <Route path="/module/:name/:id" element={<DetailPage />} />
            <Route path="/ai" element={<AIInsights />} />
            <Route path="/soc" element={<SOCDashboard />} />
            <Route path="/devices" element={<DeviceRegistry />} />
            <Route path="/firmware" element={<FirmwareManagement />} />
            <Route path="/topology" element={<NetworkTopology />} />
            <Route path="/analytics" element={<DeviceAnalytics />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
    </Routes>
  );
}
