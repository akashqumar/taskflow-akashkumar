import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Zap, Eye, EyeOff } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { ApiError } from '../types';
import type { AxiosError } from 'axios';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: () => authApi.register(name, email, password),
    onSuccess: (res) => {
      login(res.data);
      navigate('/projects', { replace: true });
    },
    onError: (err: AxiosError<ApiError>) => {
      const data = err.response?.data;
      if (data?.fields) setErrors(data.fields);
      else setGlobalError(data?.error ?? 'Registration failed. Please try again.');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGlobalError('');
    const f: Record<string, string> = {};
    if (!name.trim())              f.name = 'is required';
    if (!email.trim())             f.email = 'is required';
    else if (!email.includes('@')) f.email = 'is invalid';
    if (password.length < 8)       f.password = 'must be at least 8 characters';
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
            Create account
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>
            Start managing your projects today
          </p>
        </div>

        {globalError && (
          <div className="form-error-banner" style={{ marginBottom: '1.25rem' }}>
            {globalError}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              type="text"
              className={`form-input ${errors.name ? 'error' : ''}`}
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
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
            <label className="form-label" htmlFor="reg-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="reg-password"
                type={showPw ? 'text' : 'password'}
                className={`form-input ${errors.password ? 'error' : ''}`}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
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
            id="register-submit"
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={mutation.isPending}
            style={{ justifyContent: 'center' }}
          >
            {mutation.isPending
              ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Creating account…</>
              : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
