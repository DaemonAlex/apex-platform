const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Validate JWT_SECRET is set at startup
if (!process.env.JWT_SECRET) {
  logger.error('CRITICAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

/**
 * Authentication middleware - verifies JWT token
 * Accepts token from:
 * - Authorization header: "Bearer <token>"
 * - x-auth-token header: "<token>"
 * - Query parameter: ?token=<token> (for download links)
 */
const authenticateToken = (req, res, next) => {
  // Check Authorization header first (Bearer token)
  let token = null;
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Fallback to x-auth-token header
  if (!token) {
    token = req.headers['x-auth-token'];
  }

  // Fallback to query parameter (for download links)
  if (!token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Access denied',
      message: 'No authentication token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

module.exports = {
  authenticateToken,
  requireRole
};
