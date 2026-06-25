import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Settings, 
  LogOut, 
  Layout, 
  Hash
} from 'lucide-react';
import useAuthStore from '../../hooks/useAuthStore';

const Sidebar = ({ mobileOpen, onClose }) => {
  const { user, logout } = useAuthStore();

  const links = [
    { to: '/social', label: 'Feed', icon: Layout },
    { to: `/${user?.role || 'student'}`, label: 'Dashboard', icon: LayoutDashboard },
    { to: '/coach/batches', label: 'Batches', icon: Users, roles: ['admin', 'coach'] },
    { to: '/schedule', label: 'Schedule', icon: Calendar },
    { to: '/settings', label: 'Settings', icon: Settings },
  ].filter(link => !link.roles || link.roles.includes(user?.role));

  return (
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar-brand">
        <span className="brand-icon">🛹</span>
        <span className="brand-name">SKATE CMS</span>
      </div>

      <nav className="sidebar-nav">
        {links.map(link => (
          <NavLink 
            key={link.to} 
            to={link.to} 
            className="nav-link"
            onClick={onClose}
          >
            <link.icon size={20} />
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">{user?.username?.[0]?.toUpperCase() || 'U'}</div>
          <div className="user-meta">
            <div className="user-name">{user?.username || 'Skater'}</div>
            <div className="user-role">{user?.role || 'Student'}</div>
          </div>
        </div>
        <button className="btn-logout" onClick={logout}>
          <LogOut size={18} />
        </button>
      </div>

      <style>{`
        .sidebar {
          width: 260px;
          height: 100vh;
          background: var(--color-surface);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
          transition: transform 0.3s ease;
        }

        .sidebar-brand {
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 800;
          font-size: 1.25rem;
          color: var(--color-accent);
        }

        .sidebar-nav {
          flex: 1;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          text-decoration: none;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .nav-link:hover, .nav-link.active {
          background: var(--color-surface-hover);
          color: var(--color-text-primary);
        }

        .nav-link.active {
          border-left: 3px solid var(--color-accent);
        }

        .sidebar-footer {
          padding: 20px;
          border-top: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          background: var(--color-accent);
          color: var(--color-bg);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        }

        .user-name {
          font-size: 0.875rem;
          font-weight: 600;
        }

        .user-role {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          text-transform: capitalize;
        }

        .btn-logout {
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .sidebar {
            position: fixed;
            left: 0;
            z-index: 100;
            transform: translateX(-100%);
          }
          .sidebar--open {
            transform: translateX(0);
          }
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
