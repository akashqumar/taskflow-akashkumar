import { Link } from 'react-router-dom';
import { Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  onToggleTheme: () => void;
  theme: 'dark' | 'light';
}

// Premium SVG logo mark — layered hexagon with flow lines
function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A78BFA" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="lg2" x1="28" y1="0" x2="0" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      {/* Outer rounded square */}
      <rect x="1" y="1" width="26" height="26" rx="7" fill="url(#lg2)" opacity="0.18" />
      {/* Inner square rotated */}
      <rect x="4" y="4" width="20" height="20" rx="5" fill="url(#lg2)" opacity="0.35" />
      {/* Lightning bolt / flow mark */}
      <path
        d="M15.5 4.5L8 15h6.5L12.5 23.5L20 13h-6.5L15.5 4.5Z"
        fill="url(#lg1)"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Navbar({ onToggleTheme, theme }: NavbarProps) {
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        {/* ── Logo ── */}
        <Link to="/projects" className="navbar-logo-link" aria-label="TaskFlow home">
          <LogoMark />
          <span className="navbar-wordmark">
            <span className="navbar-wordmark-task">Task</span>
            <span className="navbar-wordmark-flow">Flow</span>
          </span>
        </Link>

        {/* ── Right controls ── */}
        <div className="navbar-right">
          <button
            id="theme-toggle"
            className="theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {user && (
            <>
              <div className="navbar-user">
                <div className="navbar-avatar">{initials}</div>
                <span className="navbar-username">{user.name}</span>
              </div>
              <button
                id="logout-btn"
                className="btn btn-ghost btn-sm"
                onClick={logout}
                aria-label="Logout"
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
