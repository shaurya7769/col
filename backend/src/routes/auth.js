const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../utils/db');
const mailer = require('../utils/mailer');
const { validate, schemas } = require('../middleware/validate');
const { log, AUDIT_EVENTS } = require('../utils/audit');

const router = express.Router();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const SKATEPARKS = [
  'Skatepark Play Arena', 'School of Raya',
  'Burnside Skatepark, Portland', 'Venice Beach Skatepark, LA', 'Stoner Skate Plaza, LA',
  'Tompkins Square Park, NYC', 'LES Coleman Skatepark, NYC', 'FDR Skatepark, Philadelphia',
  'Louisville Extreme Park', 'Kona Skatepark, Jacksonville', 'Pier 7, San Francisco',
  'SOMA Skate Park, San Francisco', 'Millennium Park, Chicago', 'Travis Manion Foundation',
  'The Berrics, Los Angeles', 'Woodward West', 'Camp Woodward, Pennsylvania',
  'Skate City, Denver', 'Arizona Skate Park', 'Austin Skate Park, Texas',
  'Skatepark of Tampa', 'Palisade Skate Park, Colorado', 'Other / Local Park'
];

/**
 * POST /api/auth/register — Create student account with skatepark
 */
router.post('/register', validate(schemas.register), async (req, res, next) => {
  try {
    const { username, email, password, skatepark_location } = req.body;

    const checkUser = await db.query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (checkUser.rows.length > 0)
      return res.status(400).json({ success: false, message: 'An account with this email or username already exists.' });

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await db.query(
      `INSERT INTO users (username, email, password_hash, role, skatepark_location)
       VALUES ($1, $2, $3, 'student', $4)
       RETURNING id, username, email, role, skatepark_location`,
      [username.trim(), email.toLowerCase(), passwordHash, skatepark_location || null]
    );

    const user = newUser.rows[0];

    // Send verification OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.query('UPDATE users SET otp = $1, otp_expires_at = $2 WHERE id = $3', [otpCode, expiresAt, user.id]);
    await mailer.sendOTP(email.toLowerCase(), otpCode, 'verify_email');

    const tempToken = jwt.sign({ id: user.id, pendingOTP: true, purpose: 'verify_email' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    await log(AUDIT_EVENTS.REGISTER, user.id, { username: user.username, email: user.email }, req.ip);

    res.status(201).json({
      success: true, status: 'pending_otp', tempToken,
      message: 'Account created! Verify your email with the code sent to your inbox.',
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/login — Send OTP
 */
router.post('/login', validate(schemas.login), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (rows.length === 0)
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const user = rows[0];

    // Check account lockout
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(429).json({ success: false, message: `Account locked. Try again in ${mins} minute(s).` });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const attempts = (user.login_attempts || 0) + 1;
      await log(AUDIT_EVENTS.LOGIN_FAILURE, user.id, { attempt: attempts }, req.ip);
      if (attempts >= 5) {
        await db.query('UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3', [attempts, new Date(Date.now() + 15 * 60 * 1000), user.id]);
        await log(AUDIT_EVENTS.ACCOUNT_LOCKED, user.id, { reason: 'Too many failed login attempts' }, req.ip);
        return res.status(429).json({ success: false, message: 'Too many failed attempts. Account locked for 15 minutes.' });
      }
      await db.query('UPDATE users SET login_attempts = $1 WHERE id = $2', [attempts, user.id]);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Reset login attempts on successful password match
    await db.query('UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);

    // Check if email is verified
    if (!user.email_verified) {
      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.query('UPDATE users SET otp = $1, otp_expires_at = $2 WHERE id = $3', [otpCode, expiresAt, user.id]);
      await mailer.sendOTP(user.email, otpCode, 'verify_email');
      const tempToken = jwt.sign({ id: user.id, pendingOTP: true, purpose: 'verify_email' }, process.env.JWT_SECRET, { expiresIn: '10m' });
      return res.json({ success: true, status: 'pending_otp', tempToken, message: 'Please verify your email first. Check your inbox for a code.' });
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.query('UPDATE users SET otp = $1, otp_expires_at = $2 WHERE id = $3', [otpCode, expiresAt, user.id]);

    await mailer.sendOTP(user.email, otpCode, 'login');

    const tempToken = jwt.sign({ id: user.id, pendingOTP: true, purpose: 'login' }, process.env.JWT_SECRET, { expiresIn: '5m' });

    res.json({ success: true, status: 'pending_otp', tempToken, message: 'Check your email for the 6-digit code.' });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/verify-otp — Verify OTP and complete auth
 */
router.post('/verify-otp', validate(schemas.verifyOtp), async (req, res, next) => {
  try {
    const { tempToken, otpCode } = req.body;

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Session expired. Please try again.' });
    }

    if (!decoded.pendingOTP)
      return res.status(400).json({ success: false, message: 'Invalid token type.' });

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (rows.length === 0)
      return res.status(404).json({ success: false, message: 'User not found.' });

    const user = rows[0];

    if (!user.otp || !user.otp_expires_at || new Date() > new Date(user.otp_expires_at))
      return res.status(401).json({ success: false, message: 'OTP expired. Please try again.' });

    if (user.otp !== otpCode.trim()) {
      await log(AUDIT_EVENTS.OTP_FAILURE, user.id, { purpose: decoded.purpose }, req.ip);
      return res.status(401).json({ success: false, message: 'Incorrect code. Please try again.' });
    }

    await log(AUDIT_EVENTS.OTP_VERIFIED, user.id, { purpose: decoded.purpose }, req.ip);
    await db.query('UPDATE users SET otp = NULL, otp_expires_at = NULL WHERE id = $1', [user.id]);

    // Handle different purposes
    if (decoded.purpose === 'verify_email') {
      await db.query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);
      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
      return res.json({
        success: true, token,
        user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar_url, skatepark: user.skatepark_location },
        verified: true,
        message: 'Email verified successfully!',
      });
    }

    if (decoded.purpose === 'password_reset') {
      const resetToken = jwt.sign({ id: user.id, purpose: 'set_new_password' }, process.env.JWT_SECRET, { expiresIn: '5m' });
      return res.json({ success: true, status: 'otp_verified', resetToken, message: 'OTP verified. Set your new password.' });
    }

    // Default: login
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true, token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar_url, skatepark: user.skatepark_location },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/resend-otp — Resend OTP code
 */
router.post('/resend-otp', async (req, res, next) => {
  try {
    const { tempToken } = req.body;
    if (!tempToken)
      return res.status(400).json({ success: false, message: 'Token is required.' });

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Session expired. Please try again.' });
    }

    if (!decoded.pendingOTP)
      return res.status(400).json({ success: false, message: 'Invalid token type.' });

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (rows.length === 0)
      return res.status(404).json({ success: false, message: 'User not found.' });

    const user = rows[0];
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.query('UPDATE users SET otp = $1, otp_expires_at = $2 WHERE id = $3', [otpCode, expiresAt, user.id]);

    const purpose = decoded.purpose || 'login';
    await mailer.sendOTP(user.email, otpCode, purpose);

    const newTempToken = jwt.sign({ id: user.id, pendingOTP: true, purpose }, process.env.JWT_SECRET, { expiresIn: '5m' });

    res.json({ success: true, tempToken: newTempToken, message: 'New code sent to your email.' });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/forgot-password — Send password reset OTP
 */
router.post('/forgot-password', validate(schemas.forgotPassword), async (req, res, next) => {
  try {
    const { email } = req.body;

    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (rows.length === 0)
      return res.json({ success: true, message: 'If an account with that email exists, a reset code has been sent.' });

    const user = rows[0];
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.query('UPDATE users SET otp = $1, otp_expires_at = $2 WHERE id = $3', [otpCode, expiresAt, user.id]);
    await mailer.sendOTP(email.toLowerCase(), otpCode, 'password_reset');

    const tempToken = jwt.sign({ id: user.id, pendingOTP: true, purpose: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    res.json({ success: true, status: 'pending_otp', tempToken, message: 'Check your email for the password reset code.' });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/reset-password — Set new password after OTP verification
 */
router.post('/reset-password', validate(schemas.resetPassword), async (req, res, next) => {
  try {
    let decoded;
    try {
      decoded = jwt.verify(req.body.tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Session expired. Please start over.' });
    }

    if (decoded.purpose !== 'set_new_password')
      return res.status(400).json({ success: false, message: 'Invalid token type.' });

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(req.body.newPassword, salt);

    await db.query('UPDATE users SET password_hash = $1, otp = NULL, otp_expires_at = NULL, login_attempts = 0, locked_until = NULL WHERE id = $2', [passwordHash, decoded.id]);

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) { next(err); }
});

/**
 * GET /api/auth/me
 */
const { auth } = require('../middleware/auth');
router.get('/me', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, email, role, avatar_url, bio, skatepark_location, followers_count, following_count, email_verified FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user: rows[0] });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/change-password
 */
router.post('/change-password', auth, validate(schemas.changePassword), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    await log(AUDIT_EVENTS.PASSWORD_CHANGE, req.user.id, {}, req.ip);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) { next(err); }
});

/**
 * GET /api/auth/skateparks — list of available skateparks
 */
router.get('/skateparks', (req, res) => {
  res.json({ success: true, data: SKATEPARKS });
});

module.exports = router;
