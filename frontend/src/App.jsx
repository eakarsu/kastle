import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, isAuthenticated, logout } from './api';
import Login from './pages/Login';
import AccessOperations from './pages/AccessOperations';

function Protected({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

function OperationsLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  useEffect(() => {
    api('/auth/me').then(setUser).catch(() => navigate('/login', { replace: true }));
  }, [navigate]);
  return (
    <div className="operations-shell">
      <header className="operations-header">
        <div className="brand-lock">K</div>
        <div><strong>Kastle Access Control</strong><small>Governed authorization and audit</small></div>
        <div className="operator-identity"><span>{user ? `${user.fullName} · ${user.role}` : 'Loading session…'}</span><button onClick={() => { logout(); navigate('/login'); }}>Sign out</button></div>
      </header>
      <main className="operations-content"><AccessOperations user={user} /></main>
    </div>
  );
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/access" element={<Protected><OperationsLayout /></Protected>} />
    <Route path="*" element={<Navigate to={isAuthenticated() ? '/access' : '/login'} replace />} />
  </Routes>;
}
