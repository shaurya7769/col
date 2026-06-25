const db = require('./db');

const AUDIT_EVENTS = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGOUT: 'logout',
  REGISTER: 'register',
  EMAIL_VERIFIED: 'email_verified',
  PASSWORD_CHANGE: 'password_change',
  PASSWORD_RESET: 'password_reset',
  OTP_SENT: 'otp_sent',
  OTP_VERIFIED: 'otp_verified',
  OTP_FAILURE: 'otp_failure',
  PROFILE_UPDATE: 'profile_update',
  ACCOUNT_LOCKED: 'account_locked',
  ROLE_CHANGE: 'role_change',
  ANNOUNCEMENT_CREATED: 'announcement_created',
  ANNOUNCEMENT_DELETED: 'announcement_deleted',
};

const log = async (event, userId, metadata = {}, ip = null) => {
  try {
    await db.query(
      `INSERT INTO audit_logs (event, user_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [event, userId, JSON.stringify(metadata), ip]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { log, AUDIT_EVENTS };
