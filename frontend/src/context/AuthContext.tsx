import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { User, AuthResponse } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (data: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('tf_token');
      const storedUser = localStorage.getItem('tf_user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      localStorage.removeItem('tf_token');
      localStorage.removeItem('tf_user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((data: AuthResponse) => {
    localStorage.setItem('tf_token', data.token);
    localStorage.setItem('tf_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('tf_token');
    localStorage.removeItem('tf_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
