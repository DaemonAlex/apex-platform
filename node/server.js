const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');

// Import authentication middleware
const { authenticateToken, requireRole } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const userRoutes = require('./routes/users');
const roleRoutes = require('./routes/roles');
const settingsRoutes = require('./routes/settings');
const auditRoutes = require('./routes/audit');
const adminRoutes = require('./routes/admin');
const attachmentsRoutes = require('./routes/attachments');
const loadSampleRoutes = require('./routes/load-sample-data');
const roomStatusRoutes = require('./routes/room-status');
// const fieldopsRoutes = require('./routes/fieldops');
// const metricsRoutes = require('./routes/metrics');
// const insightsRoutes = require('./routes/insights');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware - ASRB 5.1.2: Content Security Policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://cdn.sheetjs.com"
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false // Required for CDN scripts
}));

// Rate limiting - trust proxy for nginx
app.set('trust proxy', 1);

// ASRB 5.1.4: Global rate limit (lowered from 1000)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use(globalLimiter);

// ASRB 5.1.4: Strict auth rate limit for brute-force protection
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' }
});

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost', 'http://localhost:80', 'https://daemonscripts.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'APEX Backend API',
    version: '1.0.0'
  });
});

// API Routes
// Public routes (no authentication required) - apply auth rate limiter
app.use('/api/auth', authLimiter, authRoutes);

// Protected routes (authentication required)
app.use('/api/projects', authenticateToken, projectRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/roles', authenticateToken, roleRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/audit', authenticateToken, auditRoutes);
app.use('/api/admin', authenticateToken, requireRole(['admin', 'superadmin', 'owner']), adminRoutes);
app.use('/api/attachments', authenticateToken, attachmentsRoutes);
app.use('/api/migrate', authenticateToken, requireRole(['admin', 'superadmin']), loadSampleRoutes);
app.use('/api/room-status', authenticateToken, roomStatusRoutes);
// app.use('/api/fieldops', fieldopsRoutes);
// app.use('/metrics', metricsRoutes);
// app.use('/insights', insightsRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Server error', { error: err.message, stack: err.stack, route: req.originalUrl, method: req.method });
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info('APEX Backend API started', { port: PORT, environment: process.env.NODE_ENV || 'development' });
});

module.exports = app;
