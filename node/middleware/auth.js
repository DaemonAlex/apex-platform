const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { pool } = require('../db');
const { verifyAccessToken, isRs256Ready } = require('../utils/jwt');

// Validate JWT_SECRET is set at startup (HS256 fallback + legacy code paths)
if (!process.env.JWT_SECRET) {
  logger.error('CRITICAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// Authentication middleware — verifies the JWT access token.
// Token source precedence (2026-04-18 P1-1):
//   1. httpOnly cookie `apex_access` — RS256 (primary)
//   2. Authorization: Bearer <token> — RS256 or HS256 legacy
//   3. x-auth-token header — HS256 legacy
// Verification tries RS256 first (new tokens), falls back to HS256 for any
// tokens minted before the key-pair rollout. Once all legacy sessions have
// expired, the HS256 branch can be deleted.
const authenticateToken = (req, res, next) => {
  let token = null;

  if (req.cookies && req.cookies.apex_access) {
    token = req.cookies.apex_access;
  }
  if (!token) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  if (!token) {
    token = req.headers['x-auth-token'];
  }

  if (!token) {
    return res.status(401).json({
      error: 'Access denied',
      message: 'No authentication token provided'
    });
  }

  try {
    let decoded = null;
    if (isRs256Ready()) {
      try { decoded = verifyAccessToken(token); } catch (_) { /* fall through */ }
    }
    if (!decoded) {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logger.security('Expired token used', { ip: req.ip, route: req.originalUrl });
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again'
      });
    }
    logger.security('Invalid token verification attempt', { ip: req.ip, route: req.originalUrl, error: err.message });
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Authentication failed'
    });
  }
};

// CSRF double-submit cookie check. On login the backend sets an `apex_csrf`
// cookie (not httpOnly) with a random token; the frontend reads it from
// document.cookie and sends it as the X-CSRF-Token header on every mutating
// request. The two must match, so a cross-origin form that can ride the
// httpOnly session cookie still can't guess the CSRF token.
//
// SameSite=Strict on the session cookie already blocks most CSRF, but this
// adds defense-in-depth against subdomain-based bypasses and any future
// sessioning code that relaxes SameSite.
const csrfProtection = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  // Only enforce when the request is authenticated by cookie. Header-auth
  // (Bearer / x-auth-token) isn't subject to browser ambient-cookie CSRF.
  if (!req.cookies || !req.cookies.apex_access) return next();

  const cookieToken = req.cookies.apex_csrf;
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    logger.security('CSRF token mismatch', { ip: req.ip, route: req.originalUrl });
    return res.status(403).json({ error: 'CSRF token missing or invalid' });
  }
  next();
};

/**
 * Role-based authorization middleware
 * Use after authenticateToken
 * @param {string[]} allowedRoles - Array of allowed role names
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Please login first'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.security('Unauthorized role access attempt', {
        userId: req.user.userId,
        email: req.user.email,
        role: req.user.role,
        requiredRoles: allowedRoles,
        route: req.originalUrl,
        ip: req.ip
      });
      return res.status(403).json({
        error: 'Access forbidden',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

/**
 * Self-or-admin authorization middleware.
 *
 * Allows the request through if the authenticated user is acting on their
 * own record (req.params[paramName] === req.user.userId) OR is an admin /
 * superadmin / owner. Use after authenticateToken on routes like
 *   PUT /api/users/:id/password
 *   PUT /api/users/:id/preferences
 *   PUT /api/users/:id/avatar
 * where users may modify their own profile but only admins may modify
 * anyone else's.
 *
 * @param {string} paramName - the URL parameter holding the target user id (default 'id')
 */
const requireSelfOrAdmin = (paramName = 'id') => {
  const adminRoles = ['admin', 'superadmin', 'owner'];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Please login first'
      });
    }

    const targetId = parseInt(req.params[paramName], 10);
    const callerId = parseInt(req.user.userId, 10);

    if (Number.isNaN(targetId)) {
      return res.status(400).json({ error: `Invalid ${paramName} parameter` });
    }

    const isSelf = targetId === callerId;
    const isAdmin = adminRoles.includes(req.user.role);

    if (!isSelf && !isAdmin) {
      logger.security('Unauthorized cross-user access attempt', {
        callerId,
        callerEmail: req.user.email,
        callerRole: req.user.role,
        targetId,
        route: req.originalUrl,
        ip: req.ip
      });
      return res.status(403).json({
        error: 'Access forbidden',
        message: 'You can only modify your own account'
      });
    }

    next();
  };
};

// Roles that bypass project_members membership checks. These users can
// see and modify every project, which matches pre-2026-04-17 behaviour
// (before the IDOR fix) for this specific set of roles only.
const PROJECT_ADMIN_ROLES = ['admin', 'superadmin', 'owner'];

// Writer roles within the membership table. 'owner' and 'editor' may mutate
// the project; 'viewer' can only read.
const PROJECT_WRITER_MEMBER_ROLES = ['owner', 'editor'];

// Check if the caller has access to the given project. Returns a role string
// ('admin' for the bypass set, or the row's project_members.role value) or
// null if the caller is neither a bypass role nor a member.
async function getProjectAccess(user, projectId) {
  if (!user) return null;
  if (PROJECT_ADMIN_ROLES.includes(user.role)) return 'admin';

  const result = await pool.query(
    'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, user.userId]
  );
  return result.rows.length ? result.rows[0].role : null;
}

// Authorize access to a single project. Returns 404 (not 403) on no-match
// to prevent an unauthenticated enumeration oracle leaking which project ids
// exist. Mount after authenticateToken on any route that operates on a
// specific project, including subroutes like POST /:projectId/tasks.
//
// @param {string} paramName - URL param with the project id (default 'projectId',
//   falling back to 'id' for routes that use :id)
// @param {'read'|'write'} mode - 'write' requires owner/editor membership
//   or bypass role; 'read' accepts any membership or bypass role.
function authorizeProject(paramName = 'projectId', mode = 'read') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const projectId = req.params[paramName] || req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: `Missing ${paramName}` });
    }

    try {
      const access = await getProjectAccess(req.user, projectId);
      if (!access) {
        logger.security('Project access denied', {
          userId: req.user.userId,
          email: req.user.email,
          role: req.user.role,
          projectId,
          route: req.originalUrl,
          ip: req.ip,
        });
        return res.status(404).json({ error: 'Project not found' });
      }
      if (mode === 'write' && access !== 'admin' && !PROJECT_WRITER_MEMBER_ROLES.includes(access)) {
        return res.status(403).json({ error: 'Read-only access to this project' });
      }
      req.projectAccess = access;
      next();
    } catch (err) {
      logger.error('authorizeProject error', { error: err.message, stack: err.stack, projectId });
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

// Return the list of project ids visible to the caller. Bypass roles see
// every project; everyone else sees only projects they are members of.
// Used by GET /api/projects to filter the list.
async function visibleProjectIds(user) {
  if (!user) return [];
  if (PROJECT_ADMIN_ROLES.includes(user.role)) return { all: true, ids: null };
  const result = await pool.query(
    'SELECT project_id FROM project_members WHERE user_id = $1',
    [user.userId]
  );
  return { all: false, ids: result.rows.map(r => r.project_id) };
}

module.exports = {
  authenticateToken,
  requireRole,
  requireSelfOrAdmin,
  authorizeProject,
  getProjectAccess,
  visibleProjectIds,
  csrfProtection,
  PROJECT_ADMIN_ROLES,
};
