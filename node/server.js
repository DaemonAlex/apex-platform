const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

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

// Security middleware
app.use(helmet());

// Rate limiting - trust proxy for nginx
app.set('trust proxy', 1);
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // increased limit
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

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
// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

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
  console.error('Server Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 APEX Backend API running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;