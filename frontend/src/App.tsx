import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import { ToastProvider } from './components/Toast';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import { useAuth } from './context/AuthContext';

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="spinner-page">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/projects" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/projects" replace /> : <RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? '/projects' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('tf_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tf_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <BrowserRouter>
      <ToastProvider>
        <Navbar onToggleTheme={toggleTheme} theme={theme} />
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  );
}
