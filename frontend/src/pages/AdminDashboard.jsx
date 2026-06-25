import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Shield, Users, Activity, Trash2, BarChart2, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';

const GRAYS = ['#ffffff', '#cccccc', '#999999', '#666666', '#444444'];

const AdminDashboard = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('analytics');

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['adminStats'],
    queryFn: async () => { const { data } = await api.get('/admin/full-stats'); return data.data; },
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['allUsers'],
    queryFn: async () => { const { data } = await api.get('/admin/users'); return data.data; },
    enabled: tab === 'users',
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['adminPosts'],
    queryFn: async () => { const { data } = await api.get('/admin/posts'); return data.data; },
    enabled: tab === 'posts',
  });

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }) => { await api.put(`/admin/users/${userId}/role`, { role }); },
    onSuccess: () => { toast.success('Role updated'); queryClient.invalidateQueries({ queryKey: ['allUsers', 'adminStats'] }); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id) => { await api.delete(`/admin/users/${id}`); },
    onSuccess: () => { toast.success('User removed'); queryClient.invalidateQueries({ queryKey: ['allUsers', 'adminStats'] }); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id) => { await api.delete(`/admin/posts/${id}`); },
    onSuccess: () => { toast.success('Post removed'); queryClient.invalidateQueries({ queryKey: ['adminPosts'] }); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const TABS = [
    { key: 'analytics', label: 'Analytics', Icon: Activity },
    { key: 'users', label: 'Users', Icon: Users },
    { key: 'posts', label: 'Content', Icon: BarChart2 },
  ];

  return (
    <div className="page-enter">
      <header className="flex-between" style={{ marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Shield size={26} opacity={0.6} />
          <div>
            <h1 className="page-title">Admin Control</h1>
            <p className="page-subtitle">Academy-wide monitoring and management</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} className={`btn ${tab === key ? 'btn--primary' : 'btn--ghost'} btn--sm`} onClick={() => setTab(key)}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </header>

      {/* Analytics */}
      {tab === 'analytics' && (
        <div className="animate-fade-in">
          {/* KPI row */}
          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            {[
              { label: 'System Status', value: statsLoading ? '...' : stats?.status || 'OFFLINE', sub: 'All services nominal' },
              { label: 'Total Users', value: statsLoading ? '...' : stats?.totalUsers || 0, sub: 'Active accounts' },
              { label: 'Active Sessions', value: statsLoading ? '...' : stats?.totalBatches || 0, sub: 'Scheduled batches' },
              { label: 'Total Posts', value: statsLoading ? '...' : stats?.totalPosts || 0, sub: 'Community content' },
            ].map(({ label, value, sub }, i) => (
              <div key={label} className={`glass-card animate-fade-in stagger-${i + 1}`}>
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
            <div className="glass-card">
              <div style={{ fontWeight: 800, marginBottom: '14px', fontSize: '0.9rem' }}>User Growth (30 days)</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stats?.growth || []} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px' }} itemStyle={{ color: 'var(--white)' }} />
                  <Line type="monotone" dataKey="users" stroke="#fff" strokeWidth={2} dot={{ r: 3, fill: '#000', stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card">
              <div style={{ fontWeight: 800, marginBottom: '14px', fontSize: '0.9rem' }}>Role Distribution</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={stats?.rolesDistribution || []} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                    {(stats?.rolesDistribution || []).map((e, i) => <Cell key={i} fill={GRAYS[i % GRAYS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {(stats?.rolesDistribution || []).map((e, i) => (
                  <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: GRAYS[i % GRAYS.length] }} />
                    {e.name} ({e.value})
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card">
              <div style={{ fontWeight: 800, marginBottom: '14px', fontSize: '0.9rem' }}><MapPin size={14} style={{ display: 'inline', marginRight: '6px' }} />Top Skateparks</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats?.locationBreakdown || []} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis dataKey="location" type="category" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px' }} />
                  <Bar dataKey="count" fill="#ffffff" radius={[0, 4, 4, 0]} barSize={16} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card">
              <div style={{ fontWeight: 800, marginBottom: '14px', fontSize: '0.9rem' }}>Platform Activity</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats?.activity || []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px' }} />
                  <Bar dataKey="value" fill="#ffffff" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div className="card animate-fade-in" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                  {['User', 'Email', 'Skatepark', 'Joined', 'Role', 'Actions'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No users yet.</td></tr>
                ) : users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.username}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{u.email}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.skatepark_location || '—'}</td>
                    <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td><span className={`badge badge--${u.role}`}>{u.role}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <select className="form-select" style={{ width: '120px', padding: '5px 28px 5px 8px', fontSize: '0.75rem' }} value={u.role}
                          onChange={e => { if (window.confirm(`Change ${u.username}'s role to ${e.target.value}?`)) roleMutation.mutate({ userId: u.id, role: e.target.value }); }}>
                          {['student', 'coach', 'admin'].map(r => <option key={r} value={r}>→ {r}</option>)}
                        </select>
                        <button className="btn btn--danger btn--sm" onClick={() => { if (window.confirm(`Delete ${u.username}?`)) deleteUserMutation.mutate(u.id); }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Posts / Content Moderation */}
      {tab === 'posts' && (
        <div className="animate-fade-in">
          <div style={{ marginBottom: '12px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {posts.length} posts across the platform. Remove any that violate community guidelines.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {postsLoading ? (
              <div className="flex-center" style={{ padding: '40px' }}><div className="spinner" /></div>
            ) : posts.map(p => (
              <div key={p.id} className="card" style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                {p.mediaUrl && (
                  <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)' }}>
                    {p.mediaType === 'image' ? <img src={p.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <video src={p.mediaUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{p.username} <span className={`badge badge--${p.role}`} style={{ marginLeft: '6px' }}>{p.role}</span></div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption || '(no caption)'}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{new Date(p.createdAt).toLocaleString()} · ♥ {p.likes}</div>
                </div>
                <button className="btn btn--danger btn--sm" onClick={() => { if (window.confirm('Remove this post?')) deletePostMutation.mutate(p.id); }} disabled={deletePostMutation.isPending}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
