import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { toast } from 'react-hot-toast';
import { Zap, X, Users, ArrowRight, Trophy } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import moment from 'moment';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

const CoachDashboard = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [progressModal, setProgressModal] = useState(null); // { batch, student }
  const [trickForm, setTrickForm] = useState({ trickName: '', status: 'learning', notes: '' });

  const { data: stats } = useQuery({ queryKey: ['coachStats'], queryFn: async () => { const { data } = await api.get('/stats/summary'); return data.data; } });
  const { data: batches = [] } = useQuery({ queryKey: ['coachBatches'], queryFn: async () => { const { data } = await api.get('/batches'); return data.data; } });

  const trickMutation = useMutation({
    mutationFn: async ({ batchId, studentId, trickName, status, notes }) => {
      await api.post(`/batches/${batchId}/tricks`, { studentId, trickName, status, notes });
    },
    onSuccess: () => { toast.success('Progress saved! 🛹'); setTrickForm({ trickName: '', status: 'learning', notes: '' }); queryClient.invalidateQueries({ queryKey: ['coachBatches'] }); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to save'),
  });

  const events = batches.map(b => ({
    id: b.id, title: b.name, resource: b,
    start: b.start_time ? new Date(b.start_time) : new Date(b.created_at),
    end: b.end_time ? new Date(b.end_time) : moment(b.created_at).add(2, 'hours').toDate(),
  }));

  return (
    <div className="page-enter">
      {progressModal && (
        <TrickEntryModal
          batch={progressModal.batch}
          student={progressModal.student}
          onClose={() => setProgressModal(null)}
          onSubmit={(data) => trickMutation.mutate({ batchId: progressModal.batch.id, studentId: progressModal.student.id, ...data })}
          loading={trickMutation.isPending}
        />
      )}

      <header className="flex-between" style={{ marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Coach Panel</h1>
          <p className="page-subtitle">Empowering the next generation of skaters.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['overview', 'students', 'calendar'].map(t => (
            <button key={t} className={`btn ${activeTab === t ? 'btn--primary' : 'btn--ghost'} btn--sm`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'overview' && (
        <div className="animate-fade-in">
          <div className="stat-grid" style={{ marginBottom: '24px' }}>
            <div className="glass-card">
              <div className="stat-label">Active Sessions</div>
              <div className="stat-value">{batches.length}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Your current teaching load</div>
            </div>
            <div className="glass-card">
              <div className="stat-label">Total Students</div>
              <div className="stat-value">{stats?.totalStudents ?? '—'}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Across all sessions</div>
            </div>
            <div className="glass-card">
              <div className="stat-label">Top Student</div>
              <div className="stat-value" style={{ fontSize: '1.4rem' }}>{stats?.topStudents?.[0]?.name || '—'}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{stats?.topStudents?.[0] ? `${stats.topStudents[0].plainEnglish}` : 'No data yet'}</div>
            </div>
          </div>

          {/* Top Students */}
          <div className="glass-card">
            <div className="section-title" style={{ marginBottom: '14px' }}><Trophy size={12} style={{ display: 'inline', marginRight: '5px' }} />Top Performing Students</div>
            {!stats?.topStudents?.length ? (
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>No trick data recorded yet. Enter student progress in the Students tab.</p>
            ) : stats.topStudents.map((s, i) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: i < stats.topStudents.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontWeight: 900, color: i === 0 ? 'var(--white)' : 'var(--text-muted)', fontSize: i === 0 ? '1.1rem' : '0.875rem', width: '20px' }}>#{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{s.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.plainEnglish}</div>
                </div>
                <div className="progress-track" style={{ width: '80px' }}>
                  <div className="progress-fill" style={{ width: `${s.pct}%` }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '32px', textAlign: 'right' }}>{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {batches.length === 0 ? (
            <div className="glass-card flex-center" style={{ padding: '40px', flexDirection: 'column', gap: '12px' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No sessions yet. Go to Calendar to create one.</p>
              <button className="btn btn--ghost btn--sm" onClick={() => navigate('/calendar')}>Open Calendar</button>
            </div>
          ) : batches.map(batch => (
            <div key={batch.id} className="card" style={{ padding: '20px' }}>
              <div className="flex-between" style={{ marginBottom: '14px' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{batch.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{batch.venue}</div>
                </div>
                <Link to={`/coach/batches/${batch.id}`} className="btn btn--ghost btn--sm">
                  Details <ArrowRight size={13} />
                </Link>
              </div>
              {batch.students?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {batch.students.map(student => (
                    <div key={student.id} className="flex-between" style={{ padding: '10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
                      <div className="flex-gap">
                        <div className="avatar" style={{ width: 32, height: 32, fontSize: '0.72rem' }}>{student.username[0].toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>{student.username}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {student.tricks ? `${student.tricks.filter(t => t?.status === 'mastered').length}/${student.tricks.length} mastered` : 'No progress logged'}
                          </div>
                        </div>
                      </div>
                      <button className="btn btn--ghost btn--sm" onClick={() => setProgressModal({ batch, student })}>
                        + Log Trick
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No students enrolled. <Link to={`/coach/batches/${batch.id}`} style={{ color: 'var(--gray-1)', textDecoration: 'underline' }}>Enroll students →</Link></p>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="animate-fade-in">
          <div className="card" style={{ height: '65vh', overflow: 'hidden', padding: '16px' }}>
            <Calendar
              localizer={localizer} events={events}
              startAccessor="start" endAccessor="end"
              selectable
              onSelectSlot={() => navigate('/calendar')}
              onSelectEvent={e => navigate(`/coach/batches/${e.id}`)}
              defaultView="week" views={['month', 'week', 'day']}
              style={{ height: '100%' }}
              eventPropGetter={() => ({ style: { background: '#fff', color: '#000', border: 'none', borderRadius: '5px', fontWeight: 700, fontSize: '0.78rem' } })}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const TrickEntryModal = ({ batch, student, onClose, onSubmit, loading }) => {
  const [form, setForm] = useState({ trickName: '', status: 'learning', notes: '' });
  const COMMON_TRICKS = ['Ollie', 'Kickflip', 'Heelflip', 'Pop Shove-it', 'Backside 180', 'Frontside 180', 'Varial Kickflip', 'Tre Flip', 'Nollie', 'Manual', 'Nose Manual', 'Boardslide', 'Noseslide', '50-50 Grind', '5-0 Grind', 'Smith Grind'];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up">
        <div className="modal-header">
          <h2 className="modal-title">Log Trick for {student.username}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Session: {batch.name}</div>

        <div className="form-group">
          <label className="form-label">Trick Name</label>
          <input list="tricks-list" className="form-input" placeholder="e.g. Kickflip" value={form.trickName}
            onChange={e => setForm(f => ({ ...f, trickName: e.target.value }))} />
          <datalist id="tricks-list">
            {COMMON_TRICKS.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>

        <div className="form-group">
          <label className="form-label">Status</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[['learning', '→ Learning'], ['mastered', '✓ Mastered'], ['not_started', '○ Not Started']].map(([val, lbl]) => (
              <button key={val} type="button"
                className={`btn btn--sm ${form.status === val ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setForm(f => ({ ...f, status: val }))}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Coach Notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input className="form-input" placeholder="Needs to pop more, good landing..." value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button className="btn btn--primary" style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => onSubmit(form)} disabled={loading || !form.trickName}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Save Progress'}
          </button>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default CoachDashboard;
