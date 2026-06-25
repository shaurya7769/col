import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { toast } from 'react-hot-toast';
import { ClipboardList, Trophy, Camera, Plus, Trash2, Flame, Clock, Smile, Meh, Frown } from 'lucide-react';

const MOODS = [
  { value: 1, icon: '😤', label: 'Frustrated' },
  { value: 2, icon: '😟', label: 'Tough' },
  { value: 3, icon: '😐', label: 'Okay' },
  { value: 4, icon: '😊', label: 'Good' },
  { value: 5, icon: '🔥', label: 'Amazing' },
];

const MoodIcon = ({ mood }) => {
  if (mood <= 2) return <Frown size={16} />;
  if (mood === 3) return <Meh size={16} />;
  return <Smile size={16} />;
};

const ProgressPage = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('practice');

  const { data: stats } = useQuery({
    queryKey: ['practiceStats'],
    queryFn: async () => { const { data } = await api.get('/progress/practice-logs/stats'); return data.data; },
  });
  const { data: logs } = useQuery({
    queryKey: ['practiceLogs'],
    queryFn: async () => { const { data } = await api.get('/progress/practice-logs'); return data.data; },
  });
  const { data: achievements } = useQuery({
    queryKey: ['achievements'],
    queryFn: async () => { const { data } = await api.get('/progress/achievements'); return data.data; },
  });
  const { data: gallery } = useQuery({
    queryKey: ['progressGallery'],
    queryFn: async () => { const { data } = await api.get('/progress/gallery'); return data.data; },
  });

  const createLogMutation = useMutation({
    mutationFn: async (payload) => { const { data } = await api.post('/progress/practice-logs', payload); return data; },
    onSuccess: () => {
      toast.success('Practice logged! 🛹');
      queryClient.invalidateQueries({ queryKey: ['practiceLogs'] });
      queryClient.invalidateQueries({ queryKey: ['practiceStats'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to log practice'),
  });

  const deleteLogMutation = useMutation({
    mutationFn: async (id) => { await api.delete(`/progress/practice-logs/${id}`); },
    onSuccess: () => {
      toast.success('Log deleted');
      queryClient.invalidateQueries({ queryKey: ['practiceLogs'] });
      queryClient.invalidateQueries({ queryKey: ['practiceStats'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to delete log'),
  });

  const uploadGalleryMutation = useMutation({
    mutationFn: async (payload) => { const { data } = await api.post('/progress/gallery', payload); return data; },
    onSuccess: () => {
      toast.success('Media uploaded!');
      queryClient.invalidateQueries({ queryKey: ['progressGallery'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to upload media'),
  });

  const deleteGalleryMutation = useMutation({
    mutationFn: async (id) => { await api.delete(`/progress/gallery/${id}`); },
    onSuccess: () => {
      toast.success('Media deleted');
      queryClient.invalidateQueries({ queryKey: ['progressGallery'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to delete media'),
  });

  return (
    <div className="page-enter">
      <header style={{ marginBottom: '24px' }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ClipboardList size={28} opacity={0.7} /> My Progress
        </h1>
        <p className="page-subtitle">Track your skate journey — every session counts</p>
      </header>

      <div className="progress-tabs">
        {[
          { key: 'practice', Icon: ClipboardList, label: 'Practice Log' },
          { key: 'achievements', Icon: Trophy, label: 'Achievements' },
          { key: 'gallery', Icon: Camera, label: 'Gallery' },
        ].map(({ key, Icon, label }) => (
          <button key={key} className={`progress-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'practice' && (
        <PracticeLogTab
          stats={stats}
          logs={logs}
          createLogMutation={createLogMutation}
          deleteLogMutation={deleteLogMutation}
        />
      )}

      {tab === 'achievements' && (
        <AchievementsTab achievements={achievements} />
      )}

      {tab === 'gallery' && (
        <GalleryTab
          gallery={gallery}
          user={user}
          uploadGalleryMutation={uploadGalleryMutation}
          deleteGalleryMutation={deleteGalleryMutation}
        />
      )}

      <style>{`
        .progress-tabs {
          display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 20px;
        }
        .progress-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 10px 16px; background: transparent; border: none;
          color: var(--text-muted); font-weight: 700; font-size: 0.82rem;
          border-bottom: 2px solid transparent; margin-bottom: -1px;
          transition: all var(--t-base) var(--ease);
        }
        .progress-tab:hover { color: var(--text-primary); }
        .progress-tab.active { color: var(--white); border-bottom-color: var(--white); }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 12px; margin-bottom: 24px;
        }

        .stat-card {
          background: var(--glass-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          padding: 18px;
          text-align: center;
        }
        .stat-card-icon { opacity: 0.4; margin-bottom: 6px; }
        .stat-card-value {
          font-size: 2rem; font-weight: 900; color: var(--white);
          line-height: 1.1; letter-spacing: -0.03em;
        }
        .stat-card-label {
          font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--text-muted); font-weight: 700; margin-top: 4px;
        }

        .practice-form {
          background: var(--glass-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          padding: 22px;
          margin-bottom: 24px;
        }
        .practice-form-title {
          font-size: 0.9rem; font-weight: 800; margin-bottom: 16px;
          display: flex; align-items: center; gap: 8px;
        }

        .mood-selector {
          display: flex; gap: 8px; flex-wrap: wrap;
        }
        .mood-btn {
          display: flex; align-items: center; justify-content: center;
          gap: 4px; padding: 8px 14px;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          background: var(--surface-2); font-size: 0.82rem; font-weight: 600;
          color: var(--text-muted); cursor: pointer;
          transition: all var(--t-fast) var(--ease);
        }
        .mood-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .mood-btn.active { border-color: var(--white); color: var(--white); background: rgba(255,255,255,0.06); }

        .log-item {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 16px; border-radius: var(--radius-md);
          background: var(--surface-2); border: 1px solid var(--border);
          transition: border-color var(--t-base) var(--ease);
        }
        .log-item:hover { border-color: var(--border-bright); }
        .log-item-icon { flex-shrink: 0; width: 36px; height: 36px; border-radius: var(--radius-full); background: var(--surface-3); display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
        .log-item-body { flex: 1; min-width: 0; }
        .log-item-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 4px; }
        .log-item-meta span { display: flex; align-items: center; gap: 4px; }
        .log-item-notes { font-size: 0.845rem; color: var(--text-secondary); line-height: 1.5; }
        .log-item-tricks { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
        .log-item-trick {
          padding: 2px 8px; border-radius: var(--radius-full); font-size: 0.7rem; font-weight: 700;
          background: rgba(255,255,255,0.06); color: var(--gray-1);
        }

        .achievements-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
        }

        .achievement-card {
          background: var(--glass-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          padding: 22px; text-align: center;
          transition: all var(--t-base) var(--ease);
          position: relative;
        }
        .achievement-card:hover { border-color: var(--border-bright); transform: translateY(-2px); }
        .achievement-card.earned { border-color: rgba(255,255,255,0.12); }
        .achievement-card.unearned { opacity: 0.35; filter: grayscale(0.7); }
        .achievement-icon { font-size: 2.2rem; margin-bottom: 10px; }
        .achievement-name { font-size: 0.9rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; }
        .achievement-desc { font-size: 0.76rem; color: var(--text-muted); line-height: 1.4; }
        .achievement-date { font-size: 0.65rem; color: var(--gray-2); margin-top: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
        .achievement-lock { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 2rem; opacity: 0.5; }

        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
        }

        .gallery-item {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          transition: border-color var(--t-base) var(--ease);
        }
        .gallery-item:hover { border-color: var(--border-bright); }
        .gallery-thumb {
          width: 100%; aspect-ratio: 16 / 10;
          object-fit: cover; background: var(--surface-3);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-dim); font-size: 0.78rem;
        }
        .gallery-body { padding: 12px 14px; }
        .gallery-caption { font-size: 0.845rem; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
        .gallery-meta { display: flex; align-items: center; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); }

        .upload-bar {
          display: flex; gap: 10px; margin-bottom: 20px;
          background: var(--glass-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          padding: 16px 20px;
          align-items: center; flex-wrap: wrap;
        }
        .upload-bar input { flex: 1; min-width: 180px; }

        .logs-list { display: flex; flex-direction: column; gap: 10px; }
        .logs-empty {
          text-align: center; padding: 48px 24px;
          color: var(--text-muted); font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
};

const PracticeLogTab = ({ stats, logs, createLogMutation, deleteLogMutation }) => {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    duration: '',
    mood: 3,
    notes: '',
    tricks: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.duration || parseInt(form.duration) <= 0) return toast.error('Duration is required');
    const tricks = form.tricks
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    createLogMutation.mutate({
      date: form.date,
      duration: parseInt(form.duration),
      mood: form.mood,
      notes: form.notes,
      tricks,
    });
    setForm(f => ({ ...f, duration: '', notes: '', tricks: '' }));
  };

  const statItems = [
    { label: 'Total Sessions', value: stats?.totalSessions ?? 0, Icon: ClipboardList },
    { label: 'Total Minutes', value: stats?.totalMinutes ?? 0, Icon: Clock },
    { label: 'Current Streak', value: stats?.currentStreak ?? 0, Icon: Flame },
    { label: 'Best Streak', value: stats?.bestStreak ?? 0, Icon: Trophy },
  ];

  return (
    <div className="animate-fade-in">
      <div className="stats-grid">
        {statItems.map(({ label, value, Icon }) => (
          <div key={label} className="stat-card">
            <div className="stat-card-icon"><Icon size={20} /></div>
            <div className="stat-card-value">{value}</div>
            <div className="stat-card-label">{label}</div>
          </div>
        ))}
      </div>

      <form className="practice-form" onSubmit={handleSubmit}>
        <div className="practice-form-title"><Plus size={16} /> Log a Practice Session</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Date</label>
            <input type="date" className="form-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Duration (minutes)</label>
            <input type="number" className="form-input" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="e.g. 60" min="1" required />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Mood</label>
          <div className="mood-selector">
            {MOODS.map(m => (
              <button
                key={m.value}
                type="button"
                className={`mood-btn ${form.mood === m.value ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, mood: m.value }))}
              >
                <span style={{ fontSize: '1.1rem' }}>{m.icon}</span>
                <span style={{ display: 'none', '@media (min-width: 480px)': { display: 'inline' } }}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Tricks Practiced</label>
          <input className="form-input" value={form.tricks} onChange={e => setForm(f => ({ ...f, tricks: e.target.value }))} placeholder="Ollie, Kickflip, Heelflip (comma separated)" />
        </div>
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="How did it go? What did you work on?" style={{ resize: 'vertical' }} />
        </div>
        <button type="submit" className="btn btn--primary" style={{ justifyContent: 'center' }} disabled={createLogMutation.isPending}>
          {createLogMutation.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <><Plus size={15} /> Log Session</>}
        </button>
      </form>

      {(!logs || logs.length === 0) ? (
        <div className="logs-empty">
          No practice sessions logged yet. Start your journey!
        </div>
      ) : (
        <div className="logs-list">
          {logs.map((log, i) => (
            <div key={log.id} className="log-item animate-fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
              <div className="log-item-icon">
                <MoodIcon mood={log.mood} />
              </div>
              <div className="log-item-body">
                <div className="log-item-meta">
                  <span>{new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span><Clock size={12} /> {log.duration} min</span>
                  {log.mood && (
                    <span>
                      <MoodIcon mood={log.mood} />
                      {' '}{MOODS.find(m => m.value === log.mood)?.icon}
                    </span>
                  )}
                </div>
                {log.notes && <p className="log-item-notes">{log.notes}</p>}
                {log.tricks && log.tricks.length > 0 && (
                  <div className="log-item-tricks">
                    {(Array.isArray(log.tricks) ? log.tricks : []).map((t, j) => (
                      <span key={j} className="log-item-trick">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="btn btn--ghost btn--sm"
                style={{ flexShrink: 0, color: 'var(--danger-text)', borderColor: 'rgba(255,107,107,0.15)' }}
                onClick={() => deleteLogMutation.mutate(log.id)}
                disabled={deleteLogMutation.isPending}
                title="Delete log"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AchievementsTab = ({ achievements }) => {
  if (!achievements || achievements.length === 0) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)' }}>
        <Trophy size={40} opacity={0.2} style={{ marginBottom: '12px' }} />
        <p style={{ fontSize: '0.875rem' }}>No achievements yet. Keep skating!</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="achievements-grid">
        {achievements.map((a, i) => (
          <div key={a.id || i} className={`achievement-card animate-pop-in stagger-${(i % 5) + 1} ${a.earned_at ? 'earned' : 'unearned'}`}>
            <div className="achievement-icon">{a.icon || '🏆'}</div>
            <div className="achievement-name">{a.name}</div>
            <div className="achievement-desc">{a.description}</div>
            {a.earned_at && (
              <div className="achievement-date">
                Earned {new Date(a.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
            {!a.earned_at && (
              <div className="achievement-lock">🔒</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const GalleryTab = ({ gallery, user, uploadGalleryMutation, deleteGalleryMutation }) => {
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [trickName, setTrickName] = useState('');

  const handleUpload = (e) => {
    e.preventDefault();
    if (!imageUrl) return toast.error('Image URL is required');
    uploadGalleryMutation.mutate({
      media_url: imageUrl,
      caption,
      trick_name: trickName,
    });
    setImageUrl('');
    setCaption('');
    setTrickName('');
  };

  return (
    <div className="animate-fade-in">
      <form className="upload-bar" onSubmit={handleUpload}>
        <Camera size={18} opacity={0.5} />
        <input className="form-input" type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Image URL..." required style={{ marginBottom: 0 }} />
        <input className="form-input" type="text" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption" style={{ marginBottom: 0, maxWidth: '160px' }} />
        <input className="form-input" type="text" value={trickName} onChange={e => setTrickName(e.target.value)} placeholder="Trick name" style={{ marginBottom: 0, maxWidth: '140px' }} />
        <button type="submit" className="btn btn--primary btn--sm" disabled={uploadGalleryMutation.isPending}>
          {uploadGalleryMutation.isPending ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><Plus size={14} /> Upload</>}
        </button>
      </form>

      {(!gallery || gallery.length === 0) ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)' }}>
          <Camera size={40} opacity={0.2} style={{ marginBottom: '12px' }} />
          <p style={{ fontSize: '0.875rem' }}>No media yet. Upload your first progress clip!</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {gallery.map((item, i) => (
            <div key={item.id || i} className="gallery-item animate-fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
              {item.media_url ? (
                <img src={item.media_url} alt={item.caption || ''} className="gallery-thumb" />
              ) : (
                <div className="gallery-thumb"><Camera size={28} /></div>
              )}
              <div className="gallery-body">
                {item.caption && <div className="gallery-caption">{item.caption}</div>}
                <div className="gallery-meta">
                  <span>{item.trick_name || '—'}</span>
                  <span>{item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                </div>
              </div>
              {item.user_id === user?.id && (
                <div style={{ padding: '0 14px 12px' }}>
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ color: 'var(--danger-text)', borderColor: 'rgba(255,107,107,0.15)', width: '100%', justifyContent: 'center' }}
                    onClick={() => deleteGalleryMutation.mutate(item.id)}
                    disabled={deleteGalleryMutation.isPending}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProgressPage;
