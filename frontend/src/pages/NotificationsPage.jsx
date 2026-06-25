import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { Bell, Heart, MessageCircle, UserPlus, Award, Calendar, AlertTriangle, CheckCheck, Trash2, Trophy, BrainCircuit, Edit3, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';

const ICONS = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  achievement: Award,
  trick_mastered: Trophy,
  goal_met: BrainCircuit,
  event_reminder: Calendar,
  announcement: AlertTriangle,
  feedback: Edit3,
  trick_approved: UserCheck,
  trick_rejected: AlertTriangle,
};

const formatTime = (ts) => {
  const d = new Date(ts);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
};

const NotificationsPage = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications');
      return data;
    },
    refetchInterval: 8000,
  });

  const notifications = data?.data || [];
  const unreadCount = data?.unread_count || 0;

  const readAllMutation = useMutation({
    mutationFn: async () => { await api.post('/notifications/read-all'); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  const readOneMutation = useMutation({
    mutationFn: async (id) => { await api.post(`/notifications/${id}/read`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  const filtered = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;

  const grouped = filtered.reduce((acc, n) => {
    const key = format(new Date(n.created_at), 'yyyy-MM-dd');
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  // Sort groups by date descending
  const sortedGroups = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  const getGroupLabel = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'MMMM d, yyyy');
  };

  return (
    <div className="page-enter">
      <header className="notif-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Bell size={22} />
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Notifications</h1>
            <p className="page-subtitle" style={{ margin: 0 }}>{unreadCount} unread</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn btn--sm ${filter === 'all' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setFilter('all')}>All</button>
          <button className={`btn btn--sm ${filter === 'unread' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setFilter('unread')}>Unread</button>
          {unreadCount > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={() => readAllMutation.mutate()} disabled={readAllMutation.isPending}>
              <CheckCheck size={14} /> Mark All Read
            </button>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="flex-center" style={{ height: '40vh' }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="notif-empty">
          <Bell size={40} opacity={0.15} />
          <h3>All caught up!</h3>
          <p style={{ color: 'var(--text-muted)' }}>No {filter === 'unread' ? 'unread ' : ''}notifications yet.</p>
        </div>
      ) : (
        <div className="notif-groups">
          {sortedGroups.map(([dateKey, items]) => (
            <div key={dateKey} className="notif-group animate-fade-in">
              <div className="notif-group-label">{getGroupLabel(dateKey)}</div>
              {items.map((n) => {
                const Icon = ICONS[n.type] || Bell;
                const isUnread = !n.read;
                return (
                  <div key={n.id} className={`notif-item ${isUnread ? 'unread' : ''}`}>
                    <div className={`notif-icon-wrap ${n.type || 'default'}`}>
                      <Icon size={16} />
                    </div>
                    <div className="notif-body">
                      <div className="notif-content">{n.content || n.message}</div>
                      <div className="notif-meta">
                        <span className="notif-time">{formatTime(n.created_at)}</span>
                        {n.link && (
                          <Link to={n.link} className="notif-link" onClick={() => { if (isUnread) readOneMutation.mutate(n.id); }}>
                            View
                          </Link>
                        )}
                      </div>
                    </div>
                    {isUnread && (
                      <button className="notif-mark-read" onClick={() => readOneMutation.mutate(n.id)} title="Mark as read">
                        <CheckCheck size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .notif-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
        }
        .notif-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; padding: 80px 20px; color: var(--text-secondary);
        }
        .notif-empty h3 { font-size: 1.05rem; font-weight: 700; }
        .notif-groups { display: flex; flex-direction: column; gap: 24px; }
        .notif-group-label {
          font-size: 0.72rem; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--text-muted);
          padding: 0 4px; margin-bottom: 8px;
        }
        .notif-item {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 16px;
          border-radius: var(--radius-lg);
          transition: all var(--t-base) var(--ease);
          margin-bottom: 4px;
        }
        .notif-item.unread { background: var(--surface-2); }
        .notif-item:hover { background: var(--surface-hover); }
        .notif-icon-wrap {
          width: 36px; height: 36px; border-radius: var(--radius-full);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; background: var(--surface-3);
          color: var(--text-muted);
        }
        .notif-icon-wrap.like { color: #ff4757; background: rgba(255,71,87,0.12); }
        .notif-icon-wrap.follow { color: #1e90ff; background: rgba(30,144,255,0.12); }
        .notif-icon-wrap.achievement,
        .notif-icon-wrap.trick_mastered,
        .notif-icon-wrap.goal_met { color: #ffd700; background: rgba(255,215,0,0.12); }
        .notif-icon-wrap.comment { color: #2ed573; background: rgba(46,213,115,0.12); }
        .notif-icon-wrap.event_reminder { color: #ffa502; background: rgba(255,165,2,0.12); }
        .notif-icon-wrap.announcement { color: #a786df; background: rgba(167,134,223,0.12); }
        .notif-icon-wrap.feedback { color: #70a1ff; background: rgba(112,161,255,0.12); }
        .notif-icon-wrap.trick_approved { color: #2ed573; background: rgba(46,213,115,0.12); }
        .notif-icon-wrap.trick_rejected { color: #ff4757; background: rgba(255,71,87,0.12); }
        .notif-body { flex: 1; min-width: 0; }
        .notif-content { font-size: 0.875rem; line-height: 1.5; color: var(--text-primary); }
        .notif-item.unread .notif-content { font-weight: 600; }
        .notif-meta {
          display: flex; align-items: center; gap: 10px;
          margin-top: 4px; font-size: 0.72rem;
        }
        .notif-time { color: var(--text-dim); }
        .notif-link {
          color: var(--white); font-weight: 700; text-decoration: none;
          font-size: 0.72rem;
        }
        .notif-link:hover { text-decoration: underline; }
        .notif-mark-read {
          background: transparent; border: none; color: var(--text-muted);
          padding: 4px; border-radius: var(--radius-sm); cursor: pointer;
          opacity: 0; transition: opacity var(--t-fast);
        }
        .notif-item:hover .notif-mark-read { opacity: 1; }
        .notif-mark-read:hover { color: var(--white); background: var(--surface-hover); }
      `}</style>
    </div>
  );
};

export default NotificationsPage;
