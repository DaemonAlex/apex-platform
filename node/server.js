// Resolve Docker secrets / file-based secrets BEFORE anything reads them.
// Any sensitive env var named e.g. DB_PASSWORD can be supplied via a
// DB_PASSWORD_FILE companion pointing at a file (the standard pattern for
// docker-compose `secrets:` blocks, Vault file mounts, etc).
const { loadSecretsFromFiles } = require('./utils/secrets');
loadSecretsFromFiles();

// Enforce TLS 1.2 minimum for ALL outbound HTTPS made by this process,
// before anything else loads. This applies to the Cisco Control Hub client,
// the Drizzle/pg PostgreSQL connection (when DB_SSL is on), nodemailer,
// and any future integrations. Node.js negotiates TLS 1.2+ by default
// since v12, but we set this explicitly so a misconfigured global agent
// or an older library cannot silently negotiate down.
const tls = require('tls');
tls.DEFAULT_MIN_VERSION = process.env.TLS_MIN_VERSION || 'TLSv1.2';

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');

// Import authentication middleware
const { authenticateToken, requireRole, csrfProtection } = require('./middleware/auth');

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
const fieldopsRoutes = require('./routes/fieldops');
const reportsRoutes = require('./routes/reports');
const contactsRoutes = require('./routes/contacts');
const meetingsRoutes = require('./routes/meetings');
const documentsRoutes = require('./routes/documents');
const vendorRoutes = require('./routes/vendors');
const ciscoRoutes = require('./routes/cisco');

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
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost', 'http://localhost:80', 'https://daemonscripts.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'X-CSRF-Token']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing (P1-1 2026-04-18) — required for httpOnly auth cookies.
app.use(cookieParser());

// CSRF double-submit (P1-1) — only enforces when the caller is cookie-authed.
// Mounted globally so it runs before every route, including /api/auth/refresh
// and /api/auth/logout.
app.use(csrfProtection);

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
app.use('/api/migrate', authenticateToken, requireRole(['admin', 'superadmin', 'owner']), loadSampleRoutes);
app.use('/api/room-status', authenticateToken, roomStatusRoutes);
app.use('/api/fieldops', authenticateToken, fieldopsRoutes);
app.use('/api/reports', authenticateToken, reportsRoutes);
app.use('/api/contacts', authenticateToken, contactsRoutes);
app.use('/api/meetings', authenticateToken, meetingsRoutes);
app.use('/api/documents', authenticateToken, documentsRoutes);
app.use('/api/vendors', authenticateToken, vendorRoutes);
app.use('/api/cisco', authenticateToken, ciscoRoutes);

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

// Verify critical tables exist before accepting traffic.
// Schema is managed by Drizzle (drizzle/schema.ts). If tables are missing,
// run: npm run db:push
const { pool } = require('./db');
async function verifySchema() {
  try {
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const tables = result.rows.map(r => r.table_name);
    const required = ['users', 'projects', 'roles', 'fieldops', 'auditlog', 'appconfig', 'rooms', 'vendors'];
    const missing = required.filter(t => !tables.includes(t));
    if (missing.length > 0) {
      logger.error('Missing required tables - run: npm run db:push', { missing });
      process.exit(1);
    }
    logger.info(`Schema verified: ${tables.length} tables present`);
  } catch (err) {
    logger.error('Schema verification failed', { error: err.message });
    process.exit(1);
  }
}

// Start server. Bound to 127.0.0.1 (2026-04-17 P0-1 hardening) — nginx
// reaches the backend on localhost and no remote client needs direct access.
// Override with APEX_BIND_HOST only if the deployment topology changes.
const BIND_HOST = process.env.APEX_BIND_HOST || '127.0.0.1';
verifySchema().then(() => {
  app.listen(PORT, BIND_HOST, () => {
    logger.info('APEX Backend API started', { host: BIND_HOST, port: PORT, environment: process.env.NODE_ENV || 'development' });
  });
});

module.exports = app;
