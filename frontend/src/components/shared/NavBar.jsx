import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Rss, MessageCircle, User, LogOut, Settings, Shield, Zap, Trophy, BarChart3, Calendar, Bell, X } from 'lucide-react';
import useAuthStore from '../../hooks/useAuthStore';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

const NAV_TABS = [
  { to: '/feed',      label: 'Feed',      Icon: Rss },
  { to: '/notifications', label: 'Alerts', Icon: Bell, badge: 'notifications' },
  { to: '/events',    label: 'Events',    Icon: Calendar },
  { to: '/progress',  label: 'Progress',  Icon: BarChart3 },
  { to: '/leaderboard', label: 'Leaderboard', Icon: Trophy },
  { to: '/messaging', label: 'Messages',  Icon: MessageCircle, badge: 'messages' },
  { to: '/profile',   label: 'Profile',   Icon: User },
];

// Mobile: show only 5 primary tabs + "More" drawer for secondary
const MOBILE_PRIMARY = ['/feed', '/events', '/progress', '/messaging', '/profile'];
const MOBILE_DRAWER = ['/notifications', '/leaderboard', '/profile'];

const MOBILE_TABS = [
  { to: '/feed',      label: 'Feed',      Icon: Rss },
  { to: '/events',    label: 'Events',    Icon: Calendar },
  { to: '/progress',  label: 'Progress',  Icon: BarChart3 },
  { to: '/messaging', label: 'Messages',  Icon: MessageCircle, badge: 'messages' },
  { to: '/profile',   label: 'Profile',   Icon: User },
];

const NavBar = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const profileRef = useRef(null);

  // Unread message count
  const { data: unreadMessages } = useQuery({
    queryKey: ['unreadCount'],
    queryFn: async () => { const { data } = await api.get('/messages/unread-count'); return data.count; },
    refetchInterval: 5000,
    enabled: !!user,
  });

  // Unread notification count
  const { data: unreadNotifs } = useQuery({
    queryKey: ['notifCount'],
    queryFn: async () => { const { data } = await api.get('/notifications/unread-count'); return data.count; },
    refetchInterval: 8000,
    enabled: !!user,
  });

  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    setMobileDrawerOpen(false);
    navigate('/login');
  };

  const roleLabel = { admin: 'Admin', coach: 'Coach', student: 'Skater' };
  const initials = user?.username?.[0]?.toUpperCase() || '?';

  return (
    <>
      {/* ───── DESKTOP TOP NAV ───── */}
      <nav className="esc-nav-top">
        {/* Brand */}
        <div className="esc-brand" onClick={() => navigate('/feed')} style={{ cursor: 'pointer' }}>
          <span className="esc-brand-icon">◈</span>
          <span className="esc-brand-name">ESCAPE</span>
        </div>

        {/* Center tabs */}
        <div className="esc-tabs">
          {NAV_TABS.map(({ to, label, Icon, badge }) => {
            const isActive = location.pathname.startsWith(to);
            const count = badge === 'messages' ? unreadMessages : badge === 'notifications' ? unreadNotifs : 0;
            return (
              <NavLink key={to} to={to} className={`esc-tab ${isActive ? 'active' : ''}`}>
                <span className="esc-tab-icon-wrap">
                  <Icon size={17} strokeWidth={isActive ? 2.5 : 1.8} />
                  {count > 0 && <span className="esc-badge">{count > 9 ? '9+' : count}</span>}
                </span>
                <span className="esc-tab-label">{label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Profile dropdown */}
        <div className="esc-profile-wrap" ref={profileRef}>
          <button className="esc-profile-btn" onClick={() => setProfileOpen(o => !o)}>
            <div className="esc-avatar">{initials}</div>
            <div className="esc-user-meta">
              <span className="esc-username">{user?.username || 'Skater'}</span>
              <span className="esc-role">
                {user?.role === 'admin' && <Shield size={9} />}
                {user?.role === 'coach' && <Zap size={9} />}
                {' '}{roleLabel[user?.role] || 'Skater'}
              </span>
            </div>
            <span className={`esc-chevron ${profileOpen ? 'open' : ''}`}>▾</span>
          </button>

          {profileOpen && (
            <div className="esc-dropdown" style={{ animation: 'slide-down 0.18s var(--ease)' }}>
              <div className="esc-dropdown-user">
                <div className="esc-avatar esc-avatar--lg">{initials}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{user?.username}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{user?.email}</div>
                </div>
              </div>
              <div className="esc-dropdown-divider" />
              <button className="esc-dropdown-item" onClick={() => { navigate('/profile'); setProfileOpen(false); }}>
                <User size={14} /> My Profile
              </button>
              {(user?.role === 'admin' || user?.role === 'coach') && (
                <button className="esc-dropdown-item" onClick={() => { navigate(`/${user.role}`); setProfileOpen(false); }}>
                  {user.role === 'admin' ? <Shield size={14} /> : <Zap size={14} />}
                  {user.role === 'admin' ? 'Admin Panel' : 'Coach Panel'}
                </button>
              )}
              <button className="esc-dropdown-item" onClick={() => { navigate('/profile?tab=settings'); setProfileOpen(false); }}>
                <Settings size={14} /> Settings
              </button>
              <div className="esc-dropdown-divider" />
              <button className="esc-dropdown-item esc-dropdown-item--danger" onClick={handleLogout}>
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ───── MOBILE TOP BAR ───── */}
      <nav className="esc-nav-mobile-top">
        <div className="esc-brand" onClick={() => navigate('/feed')} style={{ cursor: 'pointer' }}>
          <span className="esc-brand-icon">◈</span>
          <span className="esc-brand-name">ESCAPE</span>
        </div>
        <div className="esc-mobile-actions">
          <NavLink to="/notifications" className="esc-mobile-action-btn">
            <Bell size={20} />
            {unreadNotifs > 0 && <span className="esc-badge esc-badge--sm">{unreadNotifs > 9 ? '9+' : unreadNotifs}</span>}
          </NavLink>
          <button className="esc-mobile-action-btn" onClick={() => setMobileDrawerOpen(true)}>
            <div className="esc-avatar esc-avatar--sm">{initials}</div>
          </button>
        </div>
      </nav>

      {/* ───── MOBILE PROFILE DRAWER ───── */}
      {mobileDrawerOpen && (
        <div className="esc-drawer-overlay" onClick={() => setMobileDrawerOpen(false)}>
          <div className="esc-drawer animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="esc-drawer-header">
              <span className="esc-drawer-title">Account</span>
              <button className="esc-drawer-close" onClick={() => setMobileDrawerOpen(false)}><X size={20} /></button>
            </div>
            <div className="esc-drawer-user">
              <div className="esc-avatar esc-avatar--lg">{initials}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--white)' }}>{user?.username}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{user?.email}</div>
                <div className={`badge badge--${user?.role}`}>
                  {roleLabel[user?.role] || 'Skater'}
                </div>
              </div>
            </div>
            <div className="esc-dropdown-divider" style={{ margin: '16px 0' }} />
            <div className="esc-drawer-links">
              <button className="esc-drawer-item" onClick={() => { navigate('/profile'); setMobileDrawerOpen(false); }}>
                <User size={18} /> My Profile
              </button>
              <button className="esc-drawer-item" onClick={() => { navigate('/leaderboard'); setMobileDrawerOpen(false); }}>
                <Trophy size={18} /> Leaderboard
              </button>
              {(user?.role === 'admin' || user?.role === 'coach') && (
                <button className="esc-drawer-item" onClick={() => { navigate(`/${user.role}`); setMobileDrawerOpen(false); }}>
                  {user.role === 'admin' ? <Shield size={18} /> : <Zap size={18} />}
                  {user.role === 'admin' ? 'Admin Panel' : 'Coach Panel'}
                </button>
              )}
              <button className="esc-drawer-item" onClick={() => { navigate('/profile?tab=settings'); setMobileDrawerOpen(false); }}>
                <Settings size={18} /> Settings
              </button>
            </div>
            <div className="esc-dropdown-divider" style={{ margin: '16px 0' }} />
            <button className="btn btn--danger btn--full btn--lg" onClick={handleLogout} style={{ gap: '10px' }}>
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* ───── MOBILE BOTTOM NAV ───── */}
      <nav className="esc-nav-bottom">
        {MOBILE_TABS.map(({ to, label, Icon, badge }) => {
          const isActive = location.pathname.startsWith(to);
          const count = badge === 'messages' ? unreadMessages : badge === 'notifications' ? unreadNotifs : 0;
          return (
            <NavLink key={to} to={to} className={`esc-bottom-tab ${isActive ? 'active' : ''}`}>
              <span className="esc-bottom-icon-wrap">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                {count > 0 && <span className="esc-badge esc-badge--sm">{count > 9 ? '9+' : count}</span>}
              </span>
              <span className="esc-bottom-label">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      <style>{`
        /* ── Top Nav ── */
        .esc-nav-top {
          position: fixed; top: 0; left: 0; right: 0;
          height: var(--nav-h);
          background: rgba(8,8,8,0.9);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          padding: 0 20px;
          gap: 16px;
          z-index: 500;
        }

        .esc-brand {
          display: flex; align-items: center; gap: 8px; user-select: none;
        }
        .esc-brand-icon {
          font-size: 1.2rem; color: var(--white); line-height: 1;
        }
        .esc-brand-name {
          font-size: 0.78rem; font-weight: 900; color: var(--white);
          letter-spacing: 0.18em;
        }

        .esc-tabs {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 2px;
        }

        .esc-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px;
          border-radius: var(--radius-md);
          color: var(--text-muted);
          font-weight: 600; font-size: 0.82rem;
          transition: all var(--t-base) var(--ease);
          position: relative; text-decoration: none;
        }
        .esc-tab:hover { color: var(--text-primary); background: var(--surface-hover); }
        .esc-tab.active { color: var(--white); background: rgba(255,255,255,0.07); }
        .esc-tab.active::after {
          content: '';
          position: absolute; bottom: -1px; left: 14px; right: 14px;
          height: 1.5px; background: var(--white); border-radius: 2px;
        }

        .esc-tab-icon-wrap { position: relative; display: flex; }

        .esc-badge {
          position: absolute; top: -5px; right: -7px;
          background: var(--white); color: var(--bg);
          font-size: 0.55rem; font-weight: 900;
          border-radius: var(--radius-full);
          min-width: 15px; height: 15px;
          display: flex; align-items: center; justify-content: center;
          padding: 0 3px; line-height: 1;
          animation: pop-in 0.3s var(--ease-spring);
        }
        .esc-badge--sm { min-width: 14px; height: 14px; font-size: 0.5rem; }

        /* Profile */
        .esc-profile-wrap { position: relative; flex-shrink: 0; }
        .esc-profile-btn {
          display: flex; align-items: center; gap: 9px;
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: 6px 12px 6px 8px;
          color: var(--text-primary); border: none;
          transition: all var(--t-fast);
          cursor: pointer;
        }
        .esc-profile-btn:hover { background: var(--surface-hover); border-color: var(--border-bright); }

        .esc-avatar {
          width: 30px; height: 30px; border-radius: var(--radius-full);
          background: var(--surface-3); border: 1px solid var(--border-bright);
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 0.78rem; flex-shrink: 0;
          color: var(--text-primary);
        }
        .esc-avatar--sm { width: 26px; height: 26px; font-size: 0.7rem; }
        .esc-avatar--lg { width: 38px; height: 38px; font-size: 0.95rem; }

        .esc-user-meta { display: flex; flex-direction: column; gap: 1px; text-align: left; }
        .esc-username { font-size: 0.78rem; font-weight: 700; line-height: 1; }
        .esc-role {
          font-size: 0.62rem; font-weight: 600; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.06em; line-height: 1;
          display: flex; align-items: center; gap: 3px;
        }
        .esc-chevron {
          font-size: 0.8rem; color: var(--text-muted);
          transition: transform var(--t-base) var(--ease); display: inline-block;
        }
        .esc-chevron.open { transform: rotate(180deg); }

        .esc-dropdown {
          position: absolute; top: calc(100% + 8px); right: 0;
          background: var(--surface-2);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-lg);
          padding: 6px;
          min-width: 200px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          z-index: 600;
        }
        .esc-dropdown-user {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 10px 12px;
          text-align: left;
        }
        .esc-dropdown-divider { height: 1px; background: var(--border); margin: 4px 0; }
        .esc-dropdown-item {
          display: flex; align-items: center; gap: 9px;
          width: 100%; padding: 9px 10px;
          background: transparent; border: none;
          color: var(--text-secondary); font-size: 0.84rem; font-weight: 500;
          border-radius: var(--radius-sm);
          transition: all var(--t-fast);
          text-align: left;
          cursor: pointer;
        }
        .esc-dropdown-item:hover { background: var(--surface-hover); color: var(--white); }
        .esc-dropdown-item--danger { color: var(--danger-text); }
        .esc-dropdown-item--danger:hover { background: var(--danger-bg); color: var(--danger-text); }

        /* ── Mobile Top Bar ── */
        .esc-nav-mobile-top { display: none; }

        /* ── Mobile Bottom ── */
        .esc-nav-bottom { display: none; }

        @media (max-width: 767px) {
          .esc-nav-top { display: none; }
          
          .main-content {
            margin-top: calc(var(--nav-h) + 16px) !important;
          }

          .esc-nav-mobile-top {
            display: flex;
            position: fixed; top: 0; left: 0; right: 0;
            height: var(--nav-h);
            background: rgba(8,8,8,0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            z-index: 500;
          }
          .esc-mobile-actions {
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .esc-mobile-action-btn {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px;
            border-radius: var(--radius-md);
            position: relative;
            cursor: pointer;
            transition: color var(--t-fast);
          }
          .esc-mobile-action-btn:hover {
            color: var(--white);
          }

          .esc-nav-bottom {
            display: flex;
            position: fixed; bottom: 0; left: 0; right: 0;
            height: var(--nav-h);
            background: rgba(8,8,8,0.95);
            backdrop-filter: blur(20px);
            border-top: 1px solid var(--border);
            z-index: 500;
          }
          .esc-bottom-tab {
            flex: 1; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 3px;
            color: var(--text-muted); font-size: 0.58rem; font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.06em;
            transition: color var(--t-base) var(--ease);
            padding: 6px 0; position: relative;
          }
          .esc-bottom-tab:hover, .esc-bottom-tab.active { color: var(--white); }
          .esc-bottom-tab.active::before {
            content: '';
            position: absolute; top: 0; left: 20%; right: 20%;
            height: 1.5px; background: var(--white); border-radius: 2px;
          }
          .esc-bottom-icon-wrap { position: relative; display: flex; }
          .esc-bottom-label { font-size: 0.56rem; }
        }

        /* ── Mobile Drawer ── */
        .esc-drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          justify-content: flex-end;
        }
        .esc-drawer {
          width: 290px;
          height: 100%;
          background: var(--surface);
          border-left: 1px solid var(--border);
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          box-shadow: -10px 0 40px rgba(0,0,0,0.5);
          text-align: left;
        }
        .esc-drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .esc-drawer-title {
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .esc-drawer-close {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: var(--radius-sm);
        }
        .esc-drawer-close:hover {
          color: var(--white);
        }
        .esc-drawer-user {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 8px;
        }
        .esc-drawer-links {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }
        .esc-drawer-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 0.9rem;
          font-weight: 600;
          border-radius: var(--radius-md);
          transition: all var(--t-fast);
          text-align: left;
          cursor: pointer;
        }
        .esc-drawer-item:hover {
          background: var(--surface-hover);
          color: var(--white);
          transform: translateX(4px);
        }
      `}</style>
    </>
  );
};

export default NavBar;
