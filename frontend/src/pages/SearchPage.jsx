import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Search, MapPin, Users } from 'lucide-react';
import useAuthStore from '../hooks/useAuthStore';

const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('users');
  const { user: me } = useAuthStore();
  const navigate = useNavigate();

  const { data: results = [], isLoading, isFetching } = useQuery({
    queryKey: ['search', query, tab],
    queryFn: async () => {
      if (!query.trim()) return [];
      const { data } = await api.get(`/social/search?q=${encodeURIComponent(query)}&type=${tab}`);
      return data.data;
    },
    enabled: query.trim().length > 0,
    keepPreviousData: true,
  });

  const roleColors = { admin: 'var(--white)', coach: 'var(--gray-1)', student: 'var(--gray-2)' };

  return (
    <div className="page-enter">
      <header style={{ marginBottom: '20px' }}>
        <h1 className="page-title">Search</h1>
        <p className="page-subtitle">Find skaters and posts</p>
      </header>

      {/* Search bar */}
      <div className="search-bar-wrap">
        <Search size={18} className="search-bar-icon" />
        <input
          className="search-bar-input"
          placeholder="Search skaters, parks, tricks..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        {(isLoading || isFetching) && query && <div className="spinner search-spinner" />}
      </div>

      {/* Tabs */}
      <div className="search-tabs">
        {['users', 'posts'].map(t => (
          <button key={t} className={`search-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'users' ? 'Skaters' : 'Posts'}
          </button>
        ))}
      </div>

      {/* Results */}
      {query.trim() === '' ? (
        <div className="search-empty">
          <Search size={40} opacity={0.1} />
          <p>Search for skaters by username or skatepark</p>
        </div>
      ) : results.length === 0 && !isLoading ? (
        <div className="search-empty">
          <p>No {tab} found for "{query}"</p>
        </div>
      ) : (
        <div className={tab === 'posts' ? 'search-posts-grid' : 'search-users-list'}>
          {tab === 'users' && results.map((u, i) => (
            <button
              key={u.id}
              className="search-user-card animate-fade-in"
              style={{ animationDelay: `${i * 0.04}s` }}
              onClick={() => navigate(`/profile/${u.username}`)}
            >
              <div className="avatar" style={{ width: 48, height: 48, fontSize: '1.1rem', flexShrink: 0 }}>
                {u.avatar_url ? <img src={u.avatar_url} alt={u.username} /> : u.username[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{u.username}</div>
                {u.skatepark_location && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <MapPin size={11} /> {u.skatepark_location}
                  </div>
                )}
                {u.bio && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.bio}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                <span className={`badge badge--${u.role}`}>{u.role}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <Users size={10} style={{ display: 'inline', marginRight: '3px' }} />{u.followers_count || 0}
                </span>
              </div>
            </button>
          ))}

          {tab === 'posts' && results.map((p, i) => (
            <div
              key={p.id}
              className="search-post-thumb animate-fade-in"
              style={{ animationDelay: `${i * 0.03}s` }}
              onClick={() => navigate(`/profile/${p.user?.username}`)}
            >
              {p.mediaType === 'image' ? (
                <img src={p.mediaUrl} alt={p.caption} />
              ) : (
                <video src={p.mediaUrl} muted loop />
              )}
              <div className="search-post-overlay">
                <div className="search-post-meta">
                  <span style={{ fontWeight: 700, fontSize: '0.75rem' }}>@{p.user?.username}</span>
                  {p.relatedTrick && <span className="badge badge--gray" style={{ fontSize: '0.58rem' }}>{p.relatedTrick}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .search-bar-wrap {
          position: relative;
          margin-bottom: 16px;
        }
        .search-bar-icon {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          color: var(--text-muted); pointer-events: none;
        }
        .search-bar-input {
          width: 100%; padding: 13px 40px 13px 42px;
          background: var(--surface); border: 1px solid var(--border-light);
          border-radius: var(--radius-lg);
          color: var(--text-primary); font-family: var(--font-body);
          font-size: 0.95rem; outline: none;
          transition: border-color var(--t-fast), box-shadow var(--t-fast);
        }
        .search-bar-input:focus { border-color: var(--border-bright); box-shadow: 0 0 0 3px rgba(255,255,255,0.04); }
        .search-spinner { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); }

        .search-tabs {
          display: flex; gap: 4px;
          margin-bottom: 20px;
        }
        .search-tab {
          padding: 7px 16px; border-radius: var(--radius-md);
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted); font-weight: 700; font-size: 0.82rem;
          transition: all var(--t-base) var(--ease);
        }
        .search-tab:hover { color: var(--text-primary); border-color: var(--border-bright); }
        .search-tab.active { background: var(--white); color: var(--bg); border-color: var(--white); }

        .search-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; padding: 60px 20px;
          color: var(--text-muted); font-size: 0.875rem; text-align: center;
        }

        .search-users-list { display: flex; flex-direction: column; gap: 8px; }
        .search-user-card {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 16px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          width: 100%; text-align: left; color: var(--text-primary);
          transition: all var(--t-base) var(--ease);
        }
        .search-user-card:hover { border-color: var(--border-bright); background: var(--surface-2); transform: translateY(-1px); }

        .search-posts-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3px;
        }
        @media (max-width: 640px) { .search-posts-grid { grid-template-columns: repeat(2, 1fr); } }

        .search-post-thumb {
          aspect-ratio: 1;
          background: var(--surface-2);
          border-radius: var(--radius-sm);
          overflow: hidden;
          cursor: pointer;
          position: relative;
        }
        .search-post-thumb img, .search-post-thumb video {
          width: 100%; height: 100%; object-fit: cover;
          transition: transform 0.4s var(--ease);
        }
        .search-post-thumb:hover img, .search-post-thumb:hover video { transform: scale(1.05); }
        .search-post-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%);
          display: flex; align-items: flex-end;
          padding: 8px;
          opacity: 0; transition: opacity 0.2s;
        }
        .search-post-thumb:hover .search-post-overlay { opacity: 1; }
        .search-post-meta { display: flex; align-items: center; gap: 6px; }
      `}</style>
    </div>
  );
};

export default SearchPage;
