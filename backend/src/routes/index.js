const express = require('express');
const feedRoutes = require('./feed');
const authRoutes = require('./auth');
const batchRoutes = require('./batches');
const statRoutes = require('./stats');
const adminRoutes = require('./admin');
const socialRoutes = require('./social');
const messageRoutes = require('./messages');
const progressRoutes = require('./progress');
const announcementRoutes = require('./announcements');
const notificationRoutes = require('./notifications');
const eventRoutes = require('./events');
const leaderboardRoutes = require('./leaderboard');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/feed', feedRoutes);
router.use('/batches', batchRoutes);
router.use('/admin', adminRoutes);
router.use('/stats', statRoutes);
router.use('/social', socialRoutes);
router.use('/messages', messageRoutes);
router.use('/tricks', progressRoutes);
router.use('/progress', progressRoutes);
router.use('/announcements', announcementRoutes);
router.use('/notifications', notificationRoutes);
router.use('/events', eventRoutes);
router.use('/leaderboard', leaderboardRoutes);

router.get('/status', (req, res) => {
  res.json({ success: true, message: 'Escape API v3.0 — All systems operational.', timestamp: new Date().toISOString() });
});

module.exports = router;
