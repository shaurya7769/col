import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { toast } from 'react-hot-toast';
import { MapPin, Users, Settings, Trophy, Grid3x3, MessageCircle, Image } from 'lucide-react';
import SettingsPage from './SettingsPage';

const ProfilePage = () => {
  const { username } = useParams();
  const { user: me, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('posts');

  const profileUsername = username || me?.username;
  const isOwn = !username || username === me?.username;

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['profile', profileUsername],
    queryFn: async () => {
      const { data } = await api.get(`/social/profile/${profileUsername}`);
      return data.data;
    },
    enabled: !!profileUsername,
    staleTime: 30000,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (profile.isFollowing) {
        const { data } = await api.delete(`/social/follow/${profile.id}`);
        return data;
      }
      const { data } = await api.post(`/social/follow/${profile.id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', profileUsername] }),
    onError: (e) => toast.error(e.response?.data?.message || 'Action failed'),
  });

  const messageMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/messages/conversations', { otherUserId: profile.id });
      return data.data;
    },
    onSuccess: (conv) => navigate('/messaging'),
    onError: () => toast.error('Could not start conversation'),
  });

  if (isLoading) return (
    <div className="flex-center" style={{ height: '60vh' }}>
      <div className="spinner" style={{ width: 30, height: 30, borderWidth: 3 }} />
    </div>
  );

  if (error || !profile) return (
    <div className="flex-center" style={{ height: '60vh', flexDirection: 'column', gap: '12px' }}>
      <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>User not found</h2>
      <button className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}>← Go Back</button>
    </div>
  );

  const levelLabel = { Pro: '🏆 Pro', Advanced: '⚡ Advanced', Intermediate: '🛹 Intermediate', Beginner: '🌱 Beginner' };
  const mastered = profile.trickProgress?.filter(t => t.status === 'mastered').length || 0;
  const total = profile.trickProgress?.length || 0;
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

  return (
    <div className="page-enter">
      {/* Profile Header */}
      <div className="profile-header glass-card" style={{ marginBottom: '20px' }}>
        <div className="profile-header-inner">
          {/* Avatar */}
          <div className="profile-avatar-wrap">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={profile.username} className="profile-avatar-img" />
              : <div className="profile-avatar-placeholder">{profile.username[0].toUpperCase()}</div>
            }
          </div>

          {/* Info */}
          <div className="profile-info">
            <div className="profile-names">
              <h1 className="profile-username">{profile.username}</h1>
              <span className={`badge badge--${profile.role}`}>{profile.role}</span>
            </div>
            {profile.bio && <p className="profile-bio">{profile.bio}</p>}
            {profile.skatepark_location && (
              <div className="profile-location">
                <MapPin size={12} /> {profile.skatepark_location}
              </div>
            )}
            {profile.role === 'student' && total > 0 && (
              <div className="profile-level">
                <span>{levelLabel[profile.analytics?.level] || '🛹 Beginner'}</span>
                <div className="progress-track" style={{ width: '140px', marginLeft: '10px' }}>
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pct}%</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="profile-actions">
            {!isOwn ? (
              <>
                <button
                  className={`btn ${profile.isFollowing ? 'btn--ghost' : 'btn--primary'}`}
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                  style={{ minWidth: '100px' }}
                >
                  {profile.isFollowing ? 'Following' : 'Follow'}
                </button>
                <button className="btn btn--ghost" onClick={() => messageMutation.mutate()} disabled={messageMutation.isPending}>
                  <MessageCircle size={15} /> Message
                </button>
              </>
            ) : (
              <button className="btn btn--ghost btn--sm" onClick={() => setTab('settings')}>
                <Settings size={15} /> Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="profile-stats-row">
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.posts?.length || 0}</span>
            <span className="profile-stat-label">Posts</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.followers_count || 0}</span>
            <span className="profile-stat-label">Followers</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.following_count || 0}</span>
            <span className="profile-stat-label">Following</span>
          </div>
          {profile.role === 'student' && (
            <div className="profile-stat">
              <span className="profile-stat-value">{mastered}</span>
              <span className="profile-stat-label">Tricks Mastered</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        {[
          { key: 'posts', Icon: Grid3x3, label: 'Posts' },
          ...(profile.role === 'student' ? [{ key: 'progress', Icon: Trophy, label: 'Progress' }] : []),
          ...(isOwn ? [{ key: 'settings', Icon: Settings, label: 'Settings' }] : []),
        ].map(({ key, Icon, label }) => (
          <button key={key} className={`profile-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Posts grid */}
      {tab === 'posts' && (
        <div className="profile-posts-grid animate-fade-in">
          {profile.posts?.length === 0 ? (
            <div className="flex-center" style={{ gridColumn: '1 / -1', padding: '60px', flexDirection: 'column', gap: '12px', color: 'var(--text-muted)' }}>
              <Image size={36} opacity={0.2} />
              <p style={{ fontSize: '0.875rem' }}>No posts yet</p>
            </div>
          ) : profile.posts?.map((p, i) => (
            <div key={p.id} className="profile-post-thumb animate-fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
              {p.mediaType === 'image'
                ? <img src={p.mediaUrl} alt={p.caption} />
                : <video src={p.mediaUrl} muted loop />
              }
              <div className="profile-post-overlay">
                {p.relatedTrick && <span className="badge badge--white" style={{ fontSize: '0.6rem' }}>{p.relatedTrick}</span>}
                <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>♥ {p.likes}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Progress tab */}
      {tab === 'progress' && (
        <div className="animate-fade-in">
          {/* Plain English summary */}
          {isOwn && (
            <div className="glass-card" style={{ marginBottom: '20px', borderLeft: '2px solid var(--white)' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px' }}>YOUR PROGRESS SUMMARY</div>
              <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
                You've mastered <strong style={{ color: 'var(--white)' }}>{mastered}</strong> out of <strong style={{ color: 'var(--white)' }}>{total}</strong> tricks — that puts you at <strong style={{ color: 'var(--white)' }}>{pct}%</strong>!{' '}
                {pct >= 80 ? "You're absolutely crushing it! 🔥" : pct >= 50 ? "You're over halfway there — keep pushing!" : pct >= 25 ? "Great progress! Every session counts." : "Every skater starts somewhere. Keep showing up!"}
              </p>
            </div>
          )}

          {/* Progress track */}
          {total > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div className="progress-wrap">
                <div className="progress-label"><span>Overall Trick Mastery</span><span>{pct}%</span></div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            </div>
          )}

          {/* Tricks list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {['mastered', 'learning', 'not_started'].map(status => {
              const tricks = profile.trickProgress?.filter(t => t.status === status) || [];
              if (!tricks.length) return null;
              const statusLabel = { mastered: '✓ Mastered', learning: '→ Learning', not_started: '○ Not Started' };
              return (
                <div key={status}>
                  <div className="section-title" style={{ marginTop: '16px' }}>{statusLabel[status]} ({tricks.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {tricks.map(t => (
                      <div key={t.trickName} className={`trick-chip trick-chip--${status}`}>
                        {t.trickName}
                        {t.notes && <span className="trick-chip-note" title={t.notes}>*</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && isOwn && (
        <div className="animate-fade-in">
          <SettingsPage embedded />
        </div>
      )}

      <style>{`
        .profile-header { padding: 24px; }
        .profile-header-inner { display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap; padding-bottom: 20px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }

        .profile-avatar-wrap { flex-shrink: 0; }
        .profile-avatar-img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-bright); }
        .profile-avatar-placeholder {
          width: 80px; height: 80px; border-radius: 50%;
          background: var(--surface-3); border: 2px solid var(--border-bright);
          display: flex; align-items: center; justify-content: center;
          font-size: 2rem; font-weight: 900; color: var(--text-primary);
        }

        .profile-info { flex: 1; min-width: 160px; }
        .profile-names { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
        .profile-username { font-size: 1.4rem; font-weight: 900; letter-spacing: -0.03em; }
        .profile-bio { font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 8px; }
        .profile-location { display: flex; align-items: center; gap: 5px; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px; }
        .profile-level { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 700; }

        .profile-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }

        .profile-stats-row { display: flex; gap: 28px; }
        .profile-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .profile-stat-value { font-size: 1.3rem; font-weight: 900; line-height: 1; }
        .profile-stat-label { font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }

        .profile-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
        .profile-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 10px 16px; background: transparent; border: none;
          color: var(--text-muted); font-weight: 700; font-size: 0.82rem;
          border-bottom: 2px solid transparent; margin-bottom: -1px;
          transition: all var(--t-base) var(--ease);
        }
        .profile-tab:hover { color: var(--text-primary); }
        .profile-tab.active { color: var(--white); border-bottom-color: var(--white); }

        .profile-posts-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px;
        }
        @media (max-width: 480px) { .profile-posts-grid { grid-template-columns: repeat(2, 1fr); } }

        .profile-post-thumb {
          aspect-ratio: 1; overflow: hidden;
          background: var(--surface-2); border-radius: var(--radius-sm);
          cursor: pointer; position: relative;
        }
        .profile-post-thumb img, .profile-post-thumb video { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s var(--ease); }
        .profile-post-thumb:hover img, .profile-post-thumb:hover video { transform: scale(1.06); }
        .profile-post-overlay {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          opacity: 0; transition: opacity 0.2s;
        }
        .profile-post-thumb:hover .profile-post-overlay { opacity: 1; }

        .trick-chip {
          padding: 6px 12px; border-radius: var(--radius-full);
          font-size: 0.8rem; font-weight: 600;
          border: 1px solid var(--border);
          position: relative;
        }
        .trick-chip--mastered { background: rgba(255,255,255,0.08); color: var(--white); border-color: rgba(255,255,255,0.15); }
        .trick-chip--learning { background: rgba(255,255,255,0.03); color: var(--text-secondary); }
        .trick-chip--not_started { background: transparent; color: var(--text-dim); }
        .trick-chip-note { position: absolute; top: -3px; right: -3px; color: var(--gray-2); font-size: 0.7rem; font-weight: 900; background: var(--surface); border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; }
      `}</style>
    </div>
  );
};

export default ProfilePage;
