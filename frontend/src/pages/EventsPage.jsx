import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { toast } from 'react-hot-toast';
import { CalendarDays, MapPin, Users, Plus, Edit3, Check, X, HelpCircle } from 'lucide-react';

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const EventsPage = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('upcoming');
  const [modal, setModal] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const canCreate = user?.role === 'coach' || user?.role === 'admin';

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const params = tab === 'my_rsvps' ? {} : { upcoming_only: tab === 'upcoming' };
      const { data } = await api.get('/events', { params });
      return data.data || data;
    },
  });

  const filteredEvents = events.filter(e => {
    if (tab === 'my_rsvps') return e.rsvps?.some(r => r.user_id === user?.id);
    return true;
  });

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) {
        const { data } = await api.put(`/events/${payload.id}`, payload);
        return data.data;
      }
      const { data } = await api.post('/events', payload);
      return data.data;
    },
    onSuccess: () => {
      toast.success('Event saved!');
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to save event'),
  });

  const rsvpMutation = useMutation({
    mutationFn: async ({ eventId, status }) => {
      const { data } = await api.post(`/events/${eventId}/rsvp`, { status });
      return data.data;
    },
    onSuccess: () => {
      toast.success('RSVP updated!');
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'RSVP failed'),
  });

  const myRsvp = (event) => {
    const rsvp = event.rsvps?.find(r => r.user_id === user?.id || r.user?.id === user?.id);
    return rsvp?.status || null;
  };

  const getRsvpCounts = (event) => {
    const going = event.rsvps?.filter(r => r.status === 'going').length || 0;
    const maybe = event.rsvps?.filter(r => r.status === 'maybe').length || 0;
    const declined = event.rsvps?.filter(r => r.status === 'declined').length || 0;
    return { going, maybe, declined };
  };

  return (
    <div className="page-enter">
      <header className="flex-between" style={{ marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CalendarDays size={28} opacity={0.7} /> Events
          </h1>
          <p className="page-subtitle">Community skate events and meetups</p>
        </div>
        {canCreate && (
          <button className="btn btn--primary" onClick={() => setModal({})}>
            <Plus size={16} /> Create Event
          </button>
        )}
      </header>

      <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        {[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'past', label: 'Past' },
          { key: 'my_rsvps', label: 'My RSVPs' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', background: 'transparent', border: 'none',
              color: tab === key ? 'var(--white)' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.82rem',
              borderBottom: tab === key ? '2px solid var(--white)' : '2px solid transparent',
              marginBottom: '-1px', cursor: 'pointer',
              transition: 'all 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex-center" style={{ height: '40vh' }}>
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex-center" style={{ height: '30vh', flexDirection: 'column', gap: '12px', color: 'var(--text-muted)' }}>
          <CalendarDays size={40} opacity={0.2} />
          <p style={{ fontSize: '0.9rem' }}>No events found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredEvents.map((event) => {
            const expanded = expandedId === event.id;
            const counts = getRsvpCounts(event);
            const currentRsvp = myRsvp(event);
            const isCreator = event.creator_id === user?.id || event.creator?.id === user?.id;

            return (
              <div key={event.id} className="card animate-fade-in" style={{ padding: 0 }}>
                <div
                  onClick={() => setExpandedId(expanded ? null : event.id)}
                  style={{ padding: '18px 20px', cursor: 'pointer', display: 'flex', gap: '16px', flexWrap: 'wrap' }}
                >
                  {event.cover_url && (
                    <div style={{ width: '100px', height: '80px', borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0 }}>
                      <img src={event.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>{event.title}</h3>
                      {isCreator && (
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ flexShrink: 0 }}
                          onClick={(e) => { e.stopPropagation(); setModal(event); }}
                        >
                          <Edit3 size={13} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CalendarDays size={12} /> {formatDate(event.date)}
                      </span>
                      {event.end_date && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          → {formatDate(event.end_date)}
                        </span>
                      )}
                      {event.location && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={12} /> {event.location}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '0.7rem' }}>
                        {event.creator?.avatar_url ? (
                          <img src={event.creator.avatar_url} alt="" />
                        ) : (
                          (event.creator?.username?.[0] || '?').toUpperCase()
                        )}
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {event.creator?.username || 'Unknown'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { status: 'going', label: 'Going', count: counts.going, Icon: Check },
                    { status: 'maybe', label: 'Maybe', count: counts.maybe, Icon: HelpCircle },
                    { status: 'declined', label: 'Decline', count: counts.declined, Icon: X },
                  ].map(({ status, label, count, Icon: RsvpIcon }) => {
                    const isActive = currentRsvp === status;
                    return (
                      <button
                        key={status}
                        className={`btn btn--sm ${isActive ? 'btn--primary' : 'btn--ghost'}`}
                        onClick={() => rsvpMutation.mutate({ eventId: event.id, status })}
                        disabled={rsvpMutation.isPending}
                        style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                      >
                        <RsvpIcon size={12} /> {label}
                        {count > 0 && (
                          <span style={{
                            background: isActive ? 'var(--bg)' : 'var(--surface-3)',
                            padding: '0 6px', borderRadius: '10px',
                            marginLeft: '2px', fontSize: '0.65rem', fontWeight: 700,
                          }}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {event.capacity > 0 && (
                    <span style={{
                      fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <Users size={12} /> {counts.going}/{event.capacity}
                    </span>
                  )}
                </div>

                {expanded && (
                  <div className="animate-fade-in" style={{
                    borderTop: '1px solid var(--border)',
                    padding: '18px 20px',
                    background: 'var(--surface-2)',
                  }}>
                    {event.description && (
                      <p style={{
                        fontSize: '0.875rem', color: 'var(--text-secondary)',
                        lineHeight: 1.6, marginBottom: '16px', whiteSpace: 'pre-wrap',
                      }}>
                        {event.description}
                      </p>
                    )}
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
                        RSVPs ({event.rsvps?.length || 0})
                      </div>
                      {event.rsvps?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {['going', 'maybe', 'declined'].map(s => {
                            const items = event.rsvps.filter(r => r.status === s);
                            if (!items.length) return null;
                            const label = { going: 'Going', maybe: 'Maybe', declined: 'Declined' };
                            return (
                              <div key={s}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                                  {label[s]} ({items.length})
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {items.map(r => (
                                    <div key={r.id || r.user_id} style={{
                                      display: 'flex', alignItems: 'center', gap: '6px',
                                      padding: '4px 10px', background: 'var(--surface-3)',
                                      borderRadius: 'var(--radius-full)',
                                    }}>
                                      <div className="avatar" style={{ width: '22px', height: '22px', fontSize: '0.55rem' }}>
                                        {r.user?.avatar_url ? (
                                          <img src={r.user.avatar_url} alt="" />
                                        ) : (
                                          (r.user?.username?.[0] || '?').toUpperCase()
                                        )}
                                      </div>
                                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                        {r.user?.username || 'Unknown'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No RSVPs yet</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <EventModal
          event={modal}
          onClose={() => setModal(null)}
          onSubmit={(payload) => createMutation.mutate(payload)}
          loading={createMutation.isPending}
        />
      )}
    </div>
  );
};

const EventModal = ({ event, onClose, onSubmit, loading }) => {
  const isEdit = !!event.id;
  const [form, setForm] = useState({
    id: event.id || null,
    title: event.title || '',
    description: event.description || '',
    date: event.date ? event.date.slice(0, 16) : '',
    end_date: event.end_date ? event.end_date.slice(0, 16) : '',
    location: event.location || '',
    capacity: event.capacity || '',
    cover_url: event.cover_url || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title) return toast.error('Title is required');
    if (!form.date) return toast.error('Date is required');
    onSubmit({
      ...form,
      capacity: form.capacity ? Number(form.capacity) : 0,
    });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up">
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Edit Event' : 'Create Event'}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          {[
            ['title', 'Title *', 'Weekend Jam'],
            ['location', 'Location', 'FDR Skatepark'],
            ['cover_url', 'Cover Image URL', 'https://...'],
          ].map(([k, lbl, ph]) => (
            <div key={k} className="form-group">
              <label className="form-label">{lbl}</label>
              <input className="form-input" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={ph} required={lbl.includes('*')} />
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[['date', 'Date *'], ['end_date', 'End Date']].map(([k, lbl]) => (
              <div key={k} className="form-group">
                <label className="form-label">{lbl}</label>
                <input type="datetime-local" className="form-input" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} required={lbl.includes('*')} />
              </div>
            ))}
          </div>
          <div className="form-group">
            <label className="form-label">Capacity <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(0 = unlimited)</span></label>
            <input type="number" className="form-input" min="0" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="30" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What's this event about?" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="submit" className="btn btn--primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : isEdit ? 'Save Changes' : 'Create Event'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventsPage;
