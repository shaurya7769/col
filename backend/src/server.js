require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const routes = require('./routes');
const { testConnection } = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for correct IP behind reverse proxy (Render, Vercel)
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE
// ============================================
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
}));

// CORS Configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:4173').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
}));

// ============================================
// RATE LIMITING
// ============================================
// General API rate limit
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Strict login rate limit
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

// OTP send rate limit (prevent SMS/email bombing)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Try again in 15 minutes.' },
});

// OTP verify rate limit (prevent brute-force)
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many verification attempts. Try again in 15 minutes.' },
});

// Register rate limit
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, message: 'Too many registration attempts from this IP. Try again in 1 hour.' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/verify-otp', otpVerifyLimiter);
app.use('/api/auth/resend-otp', otpLimiter);
app.use('/api/auth/forgot-password', otpLimiter);

// ============================================
// BODY PARSING
// ============================================
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================
// LOGGING
// ============================================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', async (req, res) => {
  try {
    const dbOk = await testConnection();
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      db: 'connected',
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      db: 'disconnected',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// ============================================
// STATIC FILES (frontend + uploads)
// ============================================
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  console.log(`Serving frontend from: ${frontendPath}`);
} else {
  console.log(`Frontend dist not found at ${frontendPath} — API-only mode`);
}

const uploadsPath = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath));

// ============================================
// API ROUTES
// ============================================
app.use('/api', routes);

// ============================================
// 404 / SPA FALLBACK
// ============================================
app.use('*', (req, res) => {
  // If it looks like an API request, return JSON 404
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: `Route ${req.method} ${req.originalUrl} not found.`,
    });
  }
  // Otherwise try SPA index.html for client-side routing
  const indexPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).json({ success: false, message: 'Not found.' });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'CORS policy violation.' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

// ============================================
// START SERVER
// ============================================
const startServer = async () => {
  try {
    const dbOk = await testConnection();
    console.log('Database connection verified.');
  } catch (err) {
    console.error('WARNING: Database connection failed:', err.message);
    console.error('The server will start, but API requests requiring DB will fail.');
  }

  app.listen(PORT, () => {
    console.log(`
+===========================================+
|   Skate CMS & Social API Server v2.0     |
+===========================================+
|   Environment: ${(process.env.NODE_ENV || 'development').padEnd(24)}|
|   Port:        ${String(PORT).padEnd(24)}|
|   Health:      http://localhost:${PORT}/health${''.padEnd(Math.max(0, 8 - String(PORT).length))}|
+===========================================+
    `);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app; // Export for testing and Vercel
