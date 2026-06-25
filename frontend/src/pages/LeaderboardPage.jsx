import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { Trophy, Medal, TrendingUp, Clock, Target } from 'lucide-react';

const TABS = [
  { key: 'tricks', label: 'Tricks Mastered', Icon: Trophy },
  { key: 'sessions', label: 'Practice Sessions', Icon: Clock },
  { key: 'streak', label: 'Practice Streak', Icon: TrendingUp },
];

const RANK_COLORS = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
};

const RANK_ICONS = {
  1: Trophy,
  2: Medal,
  3: Medal,
};

const LeaderboardPage = () => {
  const { user } = useAuthStore();
  const [type, setType] = useState('tricks');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', type],
    queryFn: async () => {
      const { data } = await api.get(`/leaderboard?type=${type}`);
      return data.data;
    },
  });

  const entries = data?.entries || [];
  const currentUserRank = data?.currentUser;

  return (
    <div className="page-enter">
      <header style={{ marginBottom: '28px' }}>
        <h1 className="page-title">Leaderboard</h1>
        <p className="page-subtitle">See who's crushing it</p>
      </header>

      {currentUserRank && (
        <div className="glass-card" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Target size={22} color="var(--text-muted)" />
            <div>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '2px' }}>Your Rank</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.03em' }}>
                #{currentUserRank.rank}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            of {currentUserRank.totalUsers} {currentUserRank.totalUsers === 1 ? 'skater' : 'skaters'}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: '4px' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setType(key)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: type === key ? 'var(--surface-3)' : 'transparent',
              color: type === key ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.8rem',
              transition: 'all 0.2s var(--ease)',
              cursor: 'pointer',
            }}
          >
            <Icon size={15} />
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex-center" style={{ height: '200px' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Loading rankings...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px', color: 'var(--text-muted)' }}>
          <Medal size={40} opacity={0.2} />
          <p style={{ fontSize: '0.9rem' }}>No data yet — start practicing!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {entries.map((entry, i) => {
            const rank = entry.rank || i + 1;
            const isTop3 = rank <= 3;
            const rankColor = RANK_COLORS[rank];
            const RankIcon = RANK_ICONS[rank];
            const isCurrentUser = entry.username === user?.username;

            return (
              <div
                key={entry.username || i}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 18px',
                  background: isCurrentUser ? 'rgba(255,255,255,0.04)' : undefined,
                  borderColor: isCurrentUser ? 'var(--border-bright)' : undefined,
                  animation: 'fade-in 0.3s var(--ease) both',
                  animationDelay: `${i * 0.04}s`,
                }}
              >
                <div style={{ width: '40px', textAlign: 'center', flexShrink: 0 }}>
                  {isTop3 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <RankIcon size={18} color={rankColor} fill={rankColor} />
                      <span style={{ fontSize: '0.6rem', fontWeight: 900, color: rankColor }}>#{rank}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>#{rank}</span>
                  )}
                </div>

                <div className={`avatar${entry.avatarUrl ? ' avatar--img' : ''}`} style={{ width: '40px', height: '40px', flexShrink: 0 }}>
                  {entry.avatarUrl ? (
                    <img src={entry.avatarUrl} alt={entry.username} />
                  ) : (
                    <span>{entry.username ? entry.username[0].toUpperCase() : '?'}</span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: isCurrentUser ? 'var(--white)' : 'var(--text-primary)' }}>
                    {entry.username}
                  </div>
                  {type === 'sessions' && entry.minutes != null && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '1px' }}>
                      {entry.minutes} total minutes
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.03em' }}>
                    {entry.score}
                  </div>
                  <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700 }}>
                    {type === 'tricks' ? 'tricks' : type === 'sessions' ? 'sessions' : 'days'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LeaderboardPage;
