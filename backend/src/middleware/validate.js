const { z } = require('zod');

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (err) {
    if (err.errors) {
      const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return res.status(400).json({ success: false, message: messages });
    }
    next(err);
  }
};

const schemas = {
  register: z.object({
    username: z.string().min(2, 'Username must be at least 2 characters').max(30, 'Username too long').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    email: z.string().email('Valid email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long').regex(/[A-Z]/, 'Password must contain at least one uppercase letter').regex(/[a-z]/, 'Password must contain at least one lowercase letter').regex(/[0-9]/, 'Password must contain at least one number').regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    skatepark_location: z.string().max(100).optional().nullable(),
  }),

  login: z.object({
    email: z.string().email('Valid email is required'),
    password: z.string().min(1, 'Password is required'),
  }),

  verifyOtp: z.object({
    tempToken: z.string().min(1, 'Token is required'),
    otpCode: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must be 6 digits'),
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128, 'Password too long').regex(/[A-Z]/, 'Password must contain at least one uppercase letter').regex(/[a-z]/, 'Password must contain at least one lowercase letter').regex(/[0-9]/, 'Password must contain at least one number').regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  }),

  forgotPassword: z.object({
    email: z.string().email('Valid email is required'),
  }),

  resetPassword: z.object({
    tempToken: z.string().min(1, 'Token is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128, 'Password too long').regex(/[A-Z]/, 'Password must contain at least one uppercase letter').regex(/[a-z]/, 'Password must contain at least one lowercase letter').regex(/[0-9]/, 'Password must contain at least one number').regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  }),

  updateProfile: z.object({
    bio: z.string().max(500, 'Bio too long').optional().nullable(),
    avatar_url: z.string().url('Invalid avatar URL').optional().nullable(),
    skatepark_location: z.string().max(100, 'Skatepark name too long').optional().nullable(),
  }),

  createPost: z.object({
    caption: z.string().max(2000, 'Caption too long').optional().nullable(),
    relatedTrick: z.string().max(100, 'Trick name too long').optional().nullable(),
  }),

  addComment: z.object({
    content: z.string().min(1, 'Comment cannot be empty').max(1000, 'Comment too long'),
  }),

  sendMessage: z.object({
    content: z.string().min(1, 'Message cannot be empty').max(5000, 'Message too long'),
  }),

  createBatch: z.object({
    name: z.string().min(1, 'Batch name is required').max(100, 'Name too long'),
    description: z.string().max(1000, 'Description too long').optional().nullable(),
    coach_id: z.string().uuid('Invalid coach ID').optional().nullable(),
    venue: z.string().min(1, 'Venue is required').max(200, 'Venue name too long'),
    schedule: z.string().min(1, 'Schedule is required').max(200, 'Schedule too long'),
    start_time: z.string().optional().nullable(),
    end_time: z.string().optional().nullable(),
  }),

  updateTrickMastery: z.object({
    trick_name: z.string().min(1, 'Trick name is required').max(100, 'Trick name too long'),
    status: z.enum(['learning', 'mastered'], 'Invalid status'),
    notes: z.string().max(1000, 'Notes too long').optional().nullable(),
    coach_id: z.string().uuid('Invalid coach ID').optional().nullable(),
  }),
};

module.exports = { validate, schemas };