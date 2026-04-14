import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Zap, Eye, EyeOff } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { ApiError } from '../types';
import type { AxiosError } from 'axios';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: () => authApi.login(email, password),
    onSuccess: (res) => {
      login(res.data);
      navigate('/projects', { replace: true });
    },
    onError: (err: AxiosError<ApiError>) => {
      const data = err.response?.data;
      if (data?.fields) setErrors(data.fields);
      else setGlobalError(data?.error ?? 'Login failed. Please try again.');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGlobalError('');
    const f: Record<string, string> = {};
    if (!email.trim()) f.email = 'is required';
    if (!password)     f.password = 'is required';
    if (Object.keys(f).length) { setErrors(f); return; }
    mutation.mutate();
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <Zap size={32} color="var(--accent-light)" />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>
            Sign in to your TaskFlow account
          </p>
        </div>

        {globalError && (
          <div className="form-error-banner" style={{ marginBottom: '1.25rem' }}>
            {globalError}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              className={`form-input ${errors.email ? 'error' : ''}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                className={`form-input ${errors.password ? 'error' : ''}`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={mutation.isPending}
            style={{ justifyContent: 'center' }}
          >
            {mutation.isPending
              ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in…</>
              : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>

        {/* Quick-fill seed credentials hint */}
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--text-3)' }}>
          <strong style={{ color: 'var(--text-2)' }}>Test credentials:</strong><br />
          <span style={{ fontFamily: 'monospace' }}>test@example.com</span> / <span style={{ fontFamily: 'monospace' }}>password123</span>
        </div>
      </div>
    </main>
  );
}
