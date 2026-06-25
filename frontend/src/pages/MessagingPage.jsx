import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { Send, Plus, Search, MessageCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format, isToday, isYesterday } from 'date-fns';

const formatMsgTime = (ts) => {
  const d = new Date(ts);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
};

const fetchConversations = async () => {
  const { data } = await api.get('/messages/conversations');
  return data.data;
};

const fetchMessages = async (convId) => {
  const { data } = await api.get(`/messages/conversations/${convId}`);
  return data.data;
};

const MessagingPage = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeConv, setActiveConv] = useState(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [newDmUser, setNewDmUser] = useState('');
  const [showNewDm, setShowNewDm] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const bottomRef = useRef(null);

  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
    refetchInterval: 4000,
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ['messages', activeConv?.id],
    queryFn: () => fetchMessages(activeConv.id),
    enabled: !!activeConv?.id,
    refetchInterval: 3000,
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ['userSearch', userSearch],
    queryFn: async () => {
      if (!userSearch.trim()) return [];
      const { data } = await api.get(`/social/search?q=${encodeURIComponent(userSearch)}&type=users`);
      return data.data;
    },
    enabled: userSearch.length > 0,
  });

  const sendMutation = useMutation({
    mutationFn: async (content) => {
      const { data } = await api.post(`/messages/conversations/${activeConv.id}`, { content });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', activeConv?.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setMessage('');
    },
    onError: () => toast.error('Failed to send message'),
  });

  const startDmMutation = useMutation({
    mutationFn: async (otherUserId) => {
      const { data } = await api.post('/messages/conversations', { otherUserId });
      return data.data;
    },
    onSuccess: (conv, otherUserId) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      const found = searchResults.find(u => u.id === otherUserId);
      setActiveConv({ id: conv.id, otherUsername: found?.username, otherAvatar: found?.avatar_url });
      setShowNewDm(false);
      setUserSearch('');
    },
    onError: () => toast.error('Could not start conversation'),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!message.trim() || !activeConv) return;
    sendMutation.mutate(message.trim());
  };

  const filteredConvs = conversations.filter(c =>
    c.otherUsername?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="msg-root page-enter">
      {/* Sidebar */}
      <aside className="msg-sidebar">
        <div className="msg-sidebar-header">
          <h2 className="msg-sidebar-title">Messages</h2>
          <button className="btn btn--ghost btn--sm" onClick={() => setShowNewDm(s => !s)} title="New message">
            <Plus size={15} />
          </button>
        </div>

        {showNewDm && (
          <div className="msg-new-dm animate-slide-up">
            <input
              className="form-input"
              placeholder="Search users..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              autoFocus
            />
            {searchResults.length > 0 && (
              <div className="msg-user-results">
                {searchResults.map(u => (
                  <button key={u.id} className="msg-user-result" onClick={() => startDmMutation.mutate(u.id)} disabled={startDmMutation.isPending}>
                    <div className="avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>{u.username[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{u.username}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="msg-search-wrap">
          <Search size={14} className="msg-search-icon" />
          <input className="msg-search" placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="msg-conv-list">
          {convsLoading ? (
            <div className="msg-empty">Loading...</div>
          ) : filteredConvs.length === 0 ? (
            <div className="msg-empty">
              <MessageCircle size={28} opacity={0.3} />
              <span>No conversations yet</span>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowNewDm(true)}>Start one</button>
            </div>
          ) : filteredConvs.map(c => (
            <button
              key={c.id}
              className={`msg-conv-item ${activeConv?.id === c.id ? 'active' : ''}`}
              onClick={() => setActiveConv(c)}
            >
              <div className="avatar" style={{ width: 38, height: 38 }}>{(c.otherUsername || '?')[0].toUpperCase()}</div>
              <div className="msg-conv-meta">
                <div className="msg-conv-top">
                  <span className="msg-conv-name">{c.otherUsername}</span>
                  <span className="msg-conv-time">{c.lastMessageAt ? formatMsgTime(c.lastMessageAt) : ''}</span>
                </div>
                <div className="msg-conv-bottom">
                  <span className="msg-conv-preview">{c.lastMessage || 'Start chatting...'}</span>
                  {c.unreadCount > 0 && <span className="msg-unread-dot">{c.unreadCount}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Thread */}
      <main className="msg-thread">
        {!activeConv ? (
          <div className="msg-thread-empty">
            <MessageCircle size={40} opacity={0.15} />
            <h3>Select a conversation</h3>
            <p>Choose from your existing threads or start a new one</p>
          </div>
        ) : (
          <>
            <div className="msg-thread-header">
              <div className="avatar" style={{ width: 36, height: 36 }}>{(activeConv.otherUsername || '?')[0].toUpperCase()}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{activeConv.otherUsername}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{activeConv.otherRole || ''}</div>
              </div>
            </div>

            <div className="msg-bubbles">
              {msgsLoading ? (
                <div className="msg-thread-empty"><div className="spinner" /></div>
              ) : messages.map((m, i) => {
                const isMine = m.senderId === user?.id;
                const showAvatar = !isMine && (i === 0 || messages[i - 1]?.senderId !== m.senderId);
                return (
                  <div key={m.id} className={`msg-row ${isMine ? 'mine' : 'theirs'}`} style={{ animationDelay: `${i * 0.02}s` }}>
                    {!isMine && <div className="avatar" style={{ width: 28, height: 28, fontSize: '0.65rem', visibility: showAvatar ? 'visible' : 'hidden' }}>{(m.senderUsername || '?')[0].toUpperCase()}</div>}
                    <div className={`msg-bubble ${isMine ? 'msg-bubble--mine' : 'msg-bubble--theirs'}`}>
                      {m.content}
                      <span className="msg-ts">{formatMsgTime(m.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form className="msg-compose" onSubmit={handleSend}>
              <input
                className="msg-compose-input"
                placeholder={`Message ${activeConv.otherUsername}...`}
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              />
              <button type="submit" className="msg-send-btn" disabled={!message.trim() || sendMutation.isPending}>
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </main>

      <style>{`
        .msg-root {
          display: grid;
          grid-template-columns: 300px 1fr;
          height: calc(100vh - var(--nav-h) - 32px);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl);
          overflow: hidden;
        }

        @media (max-width: 767px) {
          .msg-root { grid-template-columns: 1fr; height: auto; }
          .msg-sidebar { display: ${activeConv ? 'none' : 'flex'}; }
          .msg-thread { display: ${activeConv ? 'flex' : 'none'}; height: calc(100vh - var(--nav-h) - 32px); }
        }

        .msg-sidebar {
          display: flex; flex-direction: column;
          border-right: 1px solid var(--border);
          background: var(--bg);
          min-width: 0;
        }
        .msg-sidebar-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 16px 12px;
          border-bottom: 1px solid var(--border);
        }
        .msg-sidebar-title { font-size: 1rem; font-weight: 800; }

        .msg-new-dm {
          padding: 12px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-2);
        }
        .msg-user-results { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .msg-user-result {
          display: flex; align-items: center; gap: 10px;
          padding: 8px; background: transparent; border: none;
          border-radius: var(--radius-sm); color: var(--text-primary);
          width: 100%; text-align: left;
          transition: background var(--t-fast);
        }
        .msg-user-result:hover { background: var(--surface-hover); }

        .msg-search-wrap { position: relative; padding: 10px 12px; border-bottom: 1px solid var(--border); }
        .msg-search-icon { position: absolute; left: 24px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
        .msg-search { width: 100%; padding: 8px 10px 8px 30px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary); font-size: 0.82rem; outline: none; transition: border-color var(--t-fast); }
        .msg-search:focus { border-color: var(--border-bright); }

        .msg-conv-list { flex: 1; overflow-y: auto; }
        .msg-conv-item {
          display: flex; align-items: center; gap: 11px;
          padding: 13px 14px; width: 100%; background: transparent; border: none;
          text-align: left; border-bottom: 1px solid var(--border);
          cursor: pointer; color: var(--text-primary);
          transition: background var(--t-fast);
        }
        .msg-conv-item:hover { background: var(--surface-hover); }
        .msg-conv-item.active { background: var(--surface-2); }

        .msg-conv-meta { flex: 1; min-width: 0; }
        .msg-conv-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
        .msg-conv-name { font-weight: 700; font-size: 0.84rem; }
        .msg-conv-time { font-size: 0.68rem; color: var(--text-muted); flex-shrink: 0; }
        .msg-conv-bottom { display: flex; align-items: center; justify-content: space-between; }
        .msg-conv-preview { font-size: 0.78rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
        .msg-unread-dot {
          min-width: 18px; height: 18px; border-radius: var(--radius-full);
          background: var(--white); color: var(--bg);
          font-size: 0.6rem; font-weight: 900;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px; flex-shrink: 0;
          animation: pop-in 0.3s var(--ease-spring);
        }
        .msg-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 20px; color: var(--text-muted); font-size: 0.84rem; }

        /* Thread */
        .msg-thread { display: flex; flex-direction: column; min-width: 0; }
        .msg-thread-header {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 18px; border-bottom: 1px solid var(--border);
          background: var(--surface);
          flex-shrink: 0;
        }
        .msg-thread-empty {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 12px;
          color: var(--text-muted); padding: 40px;
        }
        .msg-thread-empty h3 { font-size: 1.1rem; font-weight: 700; color: var(--text-secondary); }
        .msg-thread-empty p { font-size: 0.84rem; }

        .msg-bubbles { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }

        .msg-row {
          display: flex; align-items: flex-end; gap: 8px;
          animation: slide-up 0.2s var(--ease) both;
        }
        .msg-row.mine { flex-direction: row-reverse; }
        .msg-row.theirs { flex-direction: row; }

        .msg-bubble {
          max-width: 65%;
          padding: 10px 14px;
          border-radius: var(--radius-lg);
          font-size: 0.875rem;
          line-height: 1.5;
          position: relative;
          word-break: break-word;
        }
        .msg-bubble--mine {
          background: var(--white); color: var(--bg);
          border-bottom-right-radius: var(--radius-xs);
        }
        .msg-bubble--theirs {
          background: var(--surface-3); color: var(--text-primary);
          border: 1px solid var(--border); border-bottom-left-radius: var(--radius-xs);
        }
        .msg-ts {
          display: block; font-size: 0.6rem; margin-top: 4px;
          opacity: 0.5; text-align: right;
        }
        .msg-bubble--mine .msg-ts { color: var(--bg); }
        .msg-bubble--theirs .msg-ts { color: var(--text-muted); }

        .msg-compose {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px;
          border-top: 1px solid var(--border);
          background: var(--surface);
          flex-shrink: 0;
        }
        .msg-compose-input {
          flex: 1; padding: 10px 14px;
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: var(--radius-full);
          color: var(--text-primary); font-size: 0.875rem; outline: none;
          transition: border-color var(--t-fast);
        }
        .msg-compose-input:focus { border-color: var(--border-bright); }
        .msg-send-btn {
          width: 38px; height: 38px; border-radius: var(--radius-full);
          background: var(--white); border: none; color: var(--bg);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: all var(--t-base) var(--ease);
        }
        .msg-send-btn:hover:not(:disabled) { transform: scale(1.1) translateX(1px); }
        .msg-send-btn:disabled { opacity: 0.3; }
      `}</style>
    </div>
  );
};

export default MessagingPage;
