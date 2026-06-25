import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../hooks/useAuthStore';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, MapPin, ArrowLeft } from 'lucide-react';

const MODE = {
  LOGIN: 'login',
  REGISTER: 'register',
  OTP: 'otp',
  FORGOT_PASSWORD: 'forgot_password',
  RESET_PASSWORD: 'reset_password',
  NEW_PASSWORD: 'new_password',
};

const LoginPage = () => {
  const [mode, setMode] = useState(MODE.LOGIN);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', username: '', skatepark: '' });
  const [resetForm, setResetForm] = useState({ email: '' });
  const [newPassword, setNewPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [tempToken, setTempToken] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [otpContext, setOtpContext] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [cooldownTimer, setCooldownTimer] = useState(null);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const { data: skateparks = [] } = useQuery({
    queryKey: ['skateparks'],
    queryFn: async () => { const { data } = await api.get('/auth/skateparks'); return data.data; },
    enabled: mode === MODE.REGISTER,
  });

  const handleInput = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleOtpChange = (val, idx) => {
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < 5) document.getElementById(`otp-${idx + 1}`)?.focus();
    if (!val && idx > 0) document.getElementById(`otp-${idx - 1}`)?.focus();
  };

  const handleOtpKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) document.getElementById(`otp-${idx - 1}`)?.focus();
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = [...otp];
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setOtp(next);
    document.getElementById(`otp-${Math.min(pasted.length, 5)}`)?.focus();
  };

  const startResendCooldown = () => {
    setResendCooldown(30);
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || !tempToken) return;
    setOtpLoading(true);
    try {
      const { data } = await api.post('/auth/resend-otp', { tempToken });
      if (data.tempToken) setTempToken(data.tempToken);
      toast.success('New code sent!');
      startResendCooldown();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resend code');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === MODE.NEW_PASSWORD) {
        if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
        const { data } = await api.post('/auth/reset-password', { tempToken: resetToken, otpCode: otp.join(''), newPassword });
        toast.success(data.message);
        setMode(MODE.LOGIN);
        setOtp(['', '', '', '', '', '']);
        setNewPassword('');
        return;
      }

      if (mode === MODE.OTP) {
        const code = otp.join('');
        if (code.length !== 6) { toast.error('Enter the full 6-digit code'); return; }
        const { data } = await api.post('/auth/verify-otp', { tempToken, otpCode: code });

        if (data.status === 'otp_verified') {
          setResetToken(data.resetToken);
          setMode(MODE.NEW_PASSWORD);
          return;
        }

        if (data.verified) {
          toast.success('Email verified successfully!');
        } else {
          toast.success(`Welcome, ${data.user.username}!`);
        }

        setAuth(data.user, data.token);
        navigate('/feed');
        return;
      }

      if (mode === MODE.LOGIN) {
        const { data } = await api.post('/auth/login', { email: form.email, password: form.password });
        if (data.status === 'pending_otp') {
          setTempToken(data.tempToken);
          setOtpContext('login');
          setMode(MODE.OTP);
          startResendCooldown();
          toast(data.message, { icon: '📬' });
          return;
        }
        setAuth(data.user, data.token);
        navigate('/feed');
      } else if (mode === MODE.REGISTER) {
        const { data } = await api.post('/auth/register', {
          username: form.username, email: form.email, password: form.password,
          skatepark_location: form.skatepark || null,
        });
        if (data.status === 'pending_otp') {
          setTempToken(data.tempToken);
          setOtpContext('verify_email');
          setMode(MODE.OTP);
          startResendCooldown();
          toast(data.message, { icon: '📬' });
          return;
        }
      } else if (mode === MODE.FORGOT_PASSWORD) {
        if (!resetForm.email) { toast.error('Enter your email address'); return; }
        const { data } = await api.post('/auth/forgot-password', { email: resetForm.email });
        if (data.status === 'pending_otp') {
          setTempToken(data.tempToken);
          setOtpContext('password_reset');
          setMode(MODE.OTP);
          startResendCooldown();
          toast(data.message, { icon: '📬' });
          return;
        }
        toast(data.message, { icon: '📬' });
        goToLogin();
        return;
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    setMode(MODE.LOGIN);
    setOtp(['', '', '', '', '', '']);
    setTempToken('');
    setResetToken('');
    setNewPassword('');
  };

  const headerText = () => {
    switch (mode) {
      case MODE.OTP: return 'Enter the 6-digit code sent to your email';
      case MODE.REGISTER: return 'Create your skater profile';
      case MODE.FORGOT_PASSWORD: return 'Reset your password';
      case MODE.NEW_PASSWORD: return 'Choose a new password';
      default: return 'Sign in to your skate account';
    }
  };

  return (
    <div className="login-root">
      <div className="login-bg-art" aria-hidden>
        <div className="art-circle" />
        <div className="art-line" />
        <div className="art-grid" />
      </div>

      <div className="login-card animate-fade-in">
        {/* Header */}
        <div className="login-brand">
          <span className="login-brand-mark">◈</span>
          <h1 className="login-title">ESCAPE</h1>
          <p className="login-sub">{headerText()}</p>
        </div>

        {/* Mode tabs */}
        {(mode === MODE.LOGIN || mode === MODE.REGISTER) && (
          <div className="login-tabs">
            <button className={`login-tab ${mode === MODE.LOGIN ? 'active' : ''}`} onClick={() => setMode(MODE.LOGIN)}>Sign In</button>
            <button className={`login-tab ${mode === MODE.REGISTER ? 'active' : ''}`} onClick={() => setMode(MODE.REGISTER)}>Create Account</button>
            <div className="login-tab-indicator" style={{ transform: `translateX(${mode === MODE.REGISTER ? '100%' : '0'})` }} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {/* OTP mode */}
          {mode === MODE.OTP && (
            <>
              <div className="otp-wrap" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    className="otp-input"
                    value={digit}
                    onChange={e => handleOtpChange(e.target.value, i)}
                    onKeyDown={e => handleOtpKeyDown(e, i)}
                    maxLength={1}
                    autoFocus={i === 0}
                    autoComplete="off"
                  />
                ))}
              </div>
              <p className="otp-hint">
                Didn't receive a code?{' '}
                {resendCooldown > 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>Resend in {resendCooldown}s</span>
                ) : (
                  <button type="button" className="link-btn" onClick={handleResendOtp} disabled={otpLoading}>
                    {otpLoading ? 'Sending...' : 'Resend'}
                  </button>
                )}
              </p>
            </>
          )}

          {/* Forgot Password mode */}
          {mode === MODE.FORGOT_PASSWORD && (
            <>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input name="email" type="email" className="form-input" placeholder="you@escape.app" value={resetForm.email} onChange={e => setResetForm({ email: e.target.value })} required autoFocus />
              </div>
              <p className="forgot-hint">Enter your email and we'll send you a code to reset your password.</p>
            </>
          )}

          {/* New Password mode */}
          {mode === MODE.NEW_PASSWORD && (
            <>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div style={{ position: 'relative' }}>
                  <input name="newPassword" type={showPw ? 'text' : 'password'} className="form-input" placeholder="Min. 8 characters with uppercase, lowercase, number & special char" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoFocus style={{ paddingRight: '42px' }} />
                  <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', padding: '2px' }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="field-hint">Must contain uppercase, lowercase, number, and special character.</p>
              </div>
            </>
          )}

          {/* Login mode */}
          {mode === MODE.LOGIN && (
            <>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input name="email" type="email" className="form-input" placeholder="skater@escape.app" value={form.email} onChange={handleInput} required autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input name="password" type={showPw ? 'text' : 'password'} className="form-input" placeholder="••••••••" value={form.password} onChange={handleInput} required style={{ paddingRight: '42px' }} />
                  <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', padding: '2px' }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: '8px' }}>
                <button type="button" className="link-btn" onClick={() => setMode(MODE.FORGOT_PASSWORD)}>Forgot password?</button>
              </div>
            </>
          )}

          {/* Register mode */}
          {mode === MODE.REGISTER && (
            <>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input name="username" type="text" className="form-input" placeholder="sk8er_pro" value={form.username} onChange={handleInput} required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input name="email" type="email" className="form-input" placeholder="you@escape.app" value={form.email} onChange={handleInput} required />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input name="password" type={showPw ? 'text' : 'password'} className="form-input" placeholder="Min. 8 characters with uppercase, lowercase, number & special char" value={form.password} onChange={handleInput} required style={{ paddingRight: '42px' }} />
                  <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', padding: '2px' }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="field-hint">Must contain uppercase, lowercase, number, and special character.</p>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label"><MapPin size={12} style={{ display: 'inline', marginRight: '5px' }} />Your Home Skatepark <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <select name="skatepark" className="form-select" value={form.skatepark} onChange={handleInput}>
                  <option value="">Select your park...</option>
                  {skateparks.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                </select>
              </div>
            </>
          )}

          <button type="submit" className="btn btn--primary btn--full" disabled={loading} style={{ marginTop: '20px', padding: '13px', fontSize: '0.9rem' }}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> :
              mode === MODE.OTP ? 'Verify Code' :
              mode === MODE.LOGIN ? 'Sign In' :
              mode === MODE.REGISTER ? 'Create Account' :
              mode === MODE.FORGOT_PASSWORD ? 'Send Reset Code' :
              mode === MODE.NEW_PASSWORD ? 'Set New Password' : 'Continue'}
          </button>
        </form>

        {/* Back buttons */}
        {(mode === MODE.OTP || mode === MODE.FORGOT_PASSWORD || mode === MODE.NEW_PASSWORD) && (
          <button type="button" className="link-btn back-link" onClick={goToLogin}>
            <ArrowLeft size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
            Back to sign in
          </button>
        )}
      </div>

      <style>{`
        .login-root {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg);
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .login-bg-art {
          position: absolute; inset: 0; pointer-events: none; overflow: hidden;
        }
        .art-circle {
          position: absolute; width: 500px; height: 500px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.025);
          top: -100px; right: -100px;
          animation: float 8s ease-in-out infinite;
        }
        .art-line {
          position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
        }
        .art-grid {
          position: absolute; inset: 0;
          background-image: linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 48px 48px;
        }

        .login-card {
          width: 100%; max-width: 400px;
          background: var(--surface);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-xl);
          padding: 36px;
          box-shadow: 0 40px 100px rgba(0,0,0,0.6);
          position: relative; z-index: 1;
        }

        .login-brand { text-align: center; margin-bottom: 28px; }
        .login-brand-mark { font-size: 2rem; display: block; margin-bottom: 10px; line-height: 1; opacity: 0.9; }
        .login-title { font-size: 1.1rem; font-weight: 900; letter-spacing: 0.2em; color: var(--white); margin-bottom: 6px; }
        .login-sub { font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; }

        .login-tabs {
          display: flex; position: relative;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 3px;
          margin-bottom: 24px;
          overflow: hidden;
        }
        .login-tab {
          flex: 1; padding: 8px; font-size: 0.82rem; font-weight: 700;
          background: transparent; border: none;
          color: var(--text-muted); border-radius: var(--radius-sm);
          position: relative; z-index: 1;
          transition: color var(--t-base) var(--ease);
        }
        .login-tab.active { color: var(--white); }
        .login-tab-indicator {
          position: absolute; top: 3px; bottom: 3px;
          left: 3px; width: calc(50% - 3px);
          background: var(--surface-hover);
          border: 1px solid var(--border-bright);
          border-radius: var(--radius-sm);
          transition: transform var(--t-base) var(--ease);
        }

        .login-form { display: flex; flex-direction: column; }

        .otp-wrap { display: flex; gap: 8px; justify-content: center; margin: 8px 0 16px; }
        .otp-input {
          width: 46px; height: 56px;
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--white); font-size: 1.4rem; font-weight: 800;
          text-align: center; outline: none;
          transition: border-color var(--t-fast), box-shadow var(--t-fast);
          font-family: var(--font-mono);
        }
        .otp-input:focus { border-color: var(--white); box-shadow: 0 0 0 3px rgba(255,255,255,0.06); }
        .otp-input:not(:placeholder-shown) { border-color: var(--border-bright); }
        .otp-hint { font-size: 0.78rem; color: var(--text-muted); text-align: center; margin-top: 8px; }
        .link-btn { background: none; border: none; color: var(--gray-1); font-size: inherit; cursor: pointer; text-decoration: underline; font-family: inherit; }
        .back-link { margin-top: 16px; display: block; text-align: center; width: 100%; font-size: 0.85rem; }
        .forgot-hint { font-size: 0.78rem; color: var(--text-muted); text-align: center; margin-top: 8px; line-height: 1.5; }
        .field-hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 6px; line-height: 1.4; }
      `}</style>
    </div>
  );
};

export default LoginPage;
