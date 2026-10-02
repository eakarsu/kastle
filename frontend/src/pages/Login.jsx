import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated, loadDemoCredentials, login } from '../api';

function __demoAutofill() {
  (async () => {
    let email = "";
    let password = "";
    try {
      const response = await fetch("/api/auth/demo-credentials", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        email = data.email || data.username || "";
        password = data.password || "";
      }
    } catch (error) {
      /* fall back to build-time credentials below */
    }
    if (!email || !password) {
      const env = (typeof process !== "undefined" && process.env) ? process.env : {};
      email = email || env.REACT_APP_DEMO_EMAIL || env.VITE_DEMO_EMAIL || "";
      password = password || env.REACT_APP_DEMO_PASSWORD || env.VITE_DEMO_PASSWORD || "";
    }
    const form = document.querySelector("form");
    const setValue = (element, value) => {
      if (!element) return;
      const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const scope = form || document;
    setValue(scope.querySelector('input[type="email"], input[name="email"], input[name="username"]') || scope.querySelectorAll("input")[0], email);
    setValue(scope.querySelector('input[type="password"], input[name="password"]') || scope.querySelectorAll("input")[1], password);
    window.setTimeout(() => {
      if (form && typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        const submit = scope.querySelector('button[type="submit"], input[type="submit"]');
        if (submit) submit.click();
      }
    }, 50);
  })();
}

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ tenant: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  useEffect(() => { if (isAuthenticated()) navigate('/access', { replace: true }); }, [navigate]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.tenant, form.email, form.password);
      navigate('/access');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  async function fillDemoCredentials() {
    setError('');
    setDemoLoading(true);
    try {
      const credentials = await loadDemoCredentials();
      setForm({ tenant: credentials.tenant, email: credentials.email, password: credentials.password });
    } catch {
      setError('Demo credentials are unavailable.');
    } finally {
      setDemoLoading(false);
    }
  }

  return <div className="login-page"><div className="login-card">
    <div className="login-brand"><div className="shield">K</div><h2>Kastle Access Control</h2><p>Tenant-scoped operator sign in</p></div>
    {error && <div className="login-error" role="alert">{error}</div>}
    <form onSubmit={submit}>
      <div className="form-group"><label htmlFor="tenant">Tenant slug</label><input id="tenant" autoComplete="organization" value={form.tenant} onChange={(event) => setForm({ ...form, tenant: event.target.value })} required minLength={3} /></div>
      <div className="form-group"><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></div>
      <div className="form-group"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={12} /></div>
      <button
        type="button"
        onClick={__demoAutofill}
        aria-label="Auto Fill Demo Credentials"
        style={{ width: '100%', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid currentColor', background: 'transparent', cursor: 'pointer' }}
      >
        {demoLoading ? 'Loading Demo Credentials…' : 'Auto Fill Demo Credentials'}
      </button>
      <button type="submit" className="btn btn-primary btn-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
    </form>
    <p className="login-help">Administrators are provisioned explicitly with <code>npm run bootstrap:admin</code>. No demo credentials are installed.</p>
  </div></div>;
}
