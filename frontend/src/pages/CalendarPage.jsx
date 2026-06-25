import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { X, MapPin, Clock, Users, CalendarDays } from 'lucide-react';
import { toast } from 'react-hot-toast';

const localizer = momentLocalizer(moment);

const CalendarPage = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [eventDetail, setEventDetail] = useState(null);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['calBatches'],
    queryFn: async () => { const { data } = await api.get('/batches'); return data.data; },
  });

  const createMutation = useMutation({
    mutationFn: async (payload) => { const { data } = await api.post('/batches', payload); return data.data; },
    onSuccess: () => { toast.success('Session scheduled! 🗓️'); queryClient.invalidateQueries({ queryKey: ['calBatches'] }); setModal(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create session'),
  });

  const events = batches.map(b => ({
    id: b.id, title: b.name, resource: b,
    start: b.start_time ? new Date(b.start_time) : new Date(b.created_at),
    end: b.end_time ? new Date(b.end_time) : moment(b.created_at).add(2, 'hours').toDate(),
  }));

  const canCreate = user?.role === 'coach' || user?.role === 'admin';

  return (
    <div className="page-enter">
      <header className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CalendarDays size={28} opacity={0.7} /> Session Calendar
          </h1>
          <p className="page-subtitle">
            {canCreate ? 'Click any slot to schedule a session' : 'Your upcoming sessions'}
          </p>
        </div>
        {canCreate && (
          <button className="btn btn--primary" onClick={() => setModal({ start: new Date(), end: moment().add(1, 'hour').toDate() })}>
            + New Session
          </button>
        )}
      </header>

      <div className="card" style={{ height: '68vh', overflow: 'hidden', padding: '16px' }}>
        {isLoading ? (
          <div className="flex-center" style={{ height: '100%' }}><div className="spinner" /></div>
        ) : (
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            selectable={canCreate}
            onSelectSlot={({ start, end }) => canCreate && setModal({ start, end })}
            onSelectEvent={e => setEventDetail(e.resource)}
            defaultView={canCreate ? 'week' : 'agenda'}
            views={canCreate ? ['month', 'week', 'day'] : ['month', 'agenda']}
            style={{ height: '100%' }}
            eventPropGetter={() => ({
              style: { background: '#fff', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.78rem' }
            })}
          />
        )}
      </div>

      {/* Create modal */}
      {modal && canCreate && (
        <CreateSessionModal
          initialStart={modal.start}
          initialEnd={modal.end}
          onClose={() => setModal(null)}
          onSubmit={createMutation.mutate}
          loading={createMutation.isPending}
        />
      )}

      {/* Event detail modal */}
      {eventDetail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEventDetail(null)}>
          <div className="modal animate-slide-up" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 className="modal-title">{eventDetail.name}</h2>
              <button className="modal-close" onClick={() => setEventDetail(null)}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {eventDetail.description && <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{eventDetail.description}</p>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {eventDetail.venue && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '5px 10px', borderRadius: 'var(--radius-sm)' }}>
                    <MapPin size={12} /> {eventDetail.venue}
                  </span>
                )}
                {eventDetail.schedule && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '5px 10px', borderRadius: 'var(--radius-sm)' }}>
                    <Clock size={12} /> {eventDetail.schedule}
                  </span>
                )}
              </div>
              {canCreate && (
                <button className="btn btn--ghost btn--sm" onClick={() => { setEventDetail(null); window.location.href = `/coach/batches/${eventDetail.id}`; }}>
                  <Users size={14} /> Manage Students
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CreateSessionModal = ({ initialStart, initialEnd, onClose, onSubmit, loading }) => {
  const [form, setForm] = useState({
    name: '', description: '', venue: '',
    start_time: moment(initialStart).format('YYYY-MM-DDTHH:mm'),
    end_time: moment(initialEnd).format('YYYY-MM-DDTHH:mm'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.venue) return toast.error('Name and venue are required');
    onSubmit({ ...form, schedule: `${moment(form.start_time).format('MMM Do, h:mm a')} – ${moment(form.end_time).format('h:mm a')}` });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up">
        <div className="modal-header">
          <h2 className="modal-title">Schedule Session</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          {[['name', 'Session Name *', 'Morning Shredders'], ['venue', 'Venue *', 'Burnside Skatepark']].map(([k, lbl, ph]) => (
            <div key={k} className="form-group">
              <label className="form-label">{lbl}</label>
              <input className="form-input" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={ph} required={lbl.includes('*')} />
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[['start_time', 'Start *'], ['end_time', 'End *']].map(([k, lbl]) => (
              <div key={k} className="form-group">
                <label className="form-label">{lbl}</label>
                <input type="datetime-local" className="form-input" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} required />
              </div>
            ))}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What's this session about?" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="submit" className="btn btn--primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Schedule'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CalendarPage;
