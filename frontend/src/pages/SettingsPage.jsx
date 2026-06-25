import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../hooks/useAuthStore';
import { toast } from 'react-hot-toast';
import { Lock, User, MapPin } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const SettingsPage = ({ embedded = false }) => {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [profileForm, setProfileForm] = useState({
    bio: user?.bio || '',
    skatepark_location: user?.skatepark || user?.skatepark_location || '',
    avatar_url: user?.avatar || user?.avatar_url || '',
  });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const { data: skateparks = [] } = useQuery({
    queryKey: ['skateparks'],
    queryFn: async () => { const { data } = await api.get('/auth/skateparks'); return data.data; },
  });

  const profileMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.put('/social/profile', profileForm);
      return data.data;
    },
    onSuccess: (updated) => {
      updateUser({ ...user, ...updated });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated!');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update'),
  });

  const pwMutation = useMutation({
    mutationFn: async () => {
      if (pwForm.newPassword !== pwForm.confirm) throw new Error('Passwords do not match');
      await api.post('/auth/change-password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
    },
    onSuccess: () => { toast.success('Password changed!'); setPwForm({ currentPassword: '', newPassword: '', confirm: '' }); },
    onError: (e) => toast.error(e.response?.data?.message || e.message || 'Failed to update password'),
  });

  const Section = ({ title, icon: Icon, children }) => (
    <div className="settings-section card" style={{ marginBottom: '16px', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
        <Icon size={16} color="var(--text-muted)" />
        <h3 style={{ fontSize: '0.875rem', fontWeight: 800 }}>{title}</h3>
      </div>
      {children}
    </div>
  );

  const wrapperStyle = embedded ? {} : { maxWidth: '560px' };

  return (
    <div style={wrapperStyle}>
      {!embedded && (
        <header style={{ marginBottom: '24px' }}>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your account and preferences</p>
        </header>
      )}

      {/* Profile */}
      <Section title="Profile" icon={User}>
        <div className="form-group">
          <label className="form-label">Bio</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Tell the skate community about yourself..."
            value={profileForm.bio}
            onChange={e => setProfileForm(f => ({ ...f, bio: e.target.value }))}
            style={{ resize: 'vertical' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label"><MapPin size={11} style={{ display: 'inline', marginRight: '4px' }} />Home Skatepark</label>
          <select
            className="form-select"
            value={profileForm.skatepark_location}
            onChange={e => setProfileForm(f => ({ ...f, skatepark_location: e.target.value }))}
          >
            <option value="">Select your park...</option>
            {skateparks.map(sp => <option key={sp} value={sp}>{sp}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Avatar URL <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(link to image)</span></label>
          <input
            className="form-input"
            type="url"
            placeholder="https://..."
            value={profileForm.avatar_url}
            onChange={e => setProfileForm(f => ({ ...f, avatar_url: e.target.value }))}
          />
        </div>
        <button
          className="btn btn--primary btn--sm"
          style={{ marginTop: '16px' }}
          onClick={() => profileMutation.mutate()}
          disabled={profileMutation.isPending}
        >
          {profileMutation.isPending ? 'Saving...' : 'Save Profile'}
        </button>
      </Section>

      {/* Security */}
      <Section title="Security" icon={Lock}>
        <div className="form-group">
          <label className="form-label">Current Password</label>
          <input type="password" className="form-input" placeholder="••••••••" value={pwForm.currentPassword}
            onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">New Password</label>
          <input type="password" className="form-input" placeholder="Min. 8 characters" value={pwForm.newPassword}
            onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Confirm New Password</label>
          <input type="password" className="form-input" placeholder="Repeat new password" value={pwForm.confirm}
            onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
        </div>
        <div style={{ marginTop: '8px', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          🔒 Two-Factor Authentication is active on your account. You get an email code every time you log in.
        </div>
        <button
          className="btn btn--primary btn--sm"
          style={{ marginTop: '16px' }}
          onClick={() => pwMutation.mutate()}
          disabled={pwMutation.isPending || !pwForm.currentPassword || !pwForm.newPassword}
        >
          {pwMutation.isPending ? 'Updating...' : 'Change Password'}
        </button>
      </Section>
    </div>
  );
};

export default SettingsPage;
