import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { Trophy, MapPin, Clock } from 'lucide-react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

const StudentDashboard = () => {
  const { user } = useAuthStore();
  const [calView, setCalView] = useState(false);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['studentStats'],
    queryFn: async () => { const { data } = await api.get('/stats/summary'); return data.data; },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['studentBatches'],
    queryFn: async () => { const { data } = await api.get('/batches'); return data.data; },
  });

  const events = batches.map(b => ({
    id: b.id, title: b.name,
    start: b.start_time ? new Date(b.start_time) : new Date(b.created_at),
    end: b.end_time ? new Date(b.end_time) : moment(b.created_at).add(2, 'hours').toDate(),
  }));

  const pct = stats?.progressPct || 0;
  const level = stats?.level || 'Beginner';

  const LEVEL_ICONS = { 'Pro Skater': '🏆', 'Advanced': '⚡', 'Intermediate': '🛹', 'Beginner': '🌱' };

  return (
    <div className="page-enter">
      <header style={{ marginBottom: '24px' }}>
        <h1 className="page-title">Hey, {user?.username || 'Skater'} 👋</h1>
        <p className="page-subtitle">Track your progress and upcoming sessions.</p>
      </header>

      {/* Level badge */}
      <div className="glass-card" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', padding: '20px 24px' }}>
        <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>{LEVEL_ICONS[level] || '🛹'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>Your Level</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{level}</div>
          <div style={{ marginTop: '10px' }}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '5px' }}>{pct}% to next milestone</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: '2rem', fontWeight: 900 }}>{stats?.masteredTricks || 0}</div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700 }}>Tricks Mastered</div>
        </div>
      </div>

      {/* Plain English summary */}
      {stats?.plainEnglish && (
        <div className="glass-card" style={{ marginBottom: '20px', borderLeft: '2px solid var(--white)', padding: '16px 20px' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>YOUR COACH'S SUMMARY</div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>{stats.plainEnglish}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Trick Roadmap */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Trophy size={16} color="var(--text-muted)" />
            <span style={{ fontWeight: 800, fontSize: '0.875rem' }}>Tricks in Progress</span>
          </div>
          {isLoading ? (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Loading...</p>
          ) : stats?.roadmap?.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {stats.roadmap.map((trick, i) => (
                <span key={trick} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s`, padding: '5px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 600 }}>
                  {trick}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              {stats?.totalTricks === 0 ? 'Your coach hasn\'t logged any tricks yet. Talk to them!' : 'All caught up! You\'ve mastered everything logged. 🔥'}
            </p>
          )}
        </div>

        {/* Next Session */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Clock size={16} color="var(--text-muted)" />
            <span style={{ fontWeight: 800, fontSize: '0.875rem' }}>Next Session</span>
          </div>
          {stats?.nextSession ? (
            <>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '10px' }}>{stats.nextSession.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {stats.nextSession.venue && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <MapPin size={13} /> {stats.nextSession.venue}
                  </div>
                )}
                {(stats.nextSession.start_time || stats.nextSession.schedule) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <Clock size={13} />
                    {stats.nextSession.start_time ? moment(stats.nextSession.start_time).format('MMM Do, h:mm a') : stats.nextSession.schedule}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>No upcoming sessions. Ask your coach to schedule one!</p>
          )}
        </div>
      </div>

      {/* Calendar toggle */}
      <div style={{ marginTop: '24px' }}>
        <button className="btn btn--ghost btn--sm" onClick={() => setCalView(v => !v)} style={{ marginBottom: '14px' }}>
          {calView ? 'Hide' : 'Show'} Full Schedule
        </button>
        {calView && (
          <div className="card animate-fade-in" style={{ height: '50vh', overflow: 'hidden', padding: '12px' }}>
            <Calendar
              localizer={localizer} events={events}
              startAccessor="start" endAccessor="end"
              defaultView="agenda" views={['month', 'agenda']}
              style={{ height: '100%' }}
              eventPropGetter={() => ({ style: { background: '#fff', color: '#000', border: 'none', borderRadius: '5px', fontWeight: 700, fontSize: '0.78rem' } })}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;
