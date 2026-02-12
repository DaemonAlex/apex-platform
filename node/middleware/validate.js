/**
 * APEX Validation Middleware
 * ASRB 5.1.3 - Centralized input validation using express-validator
 */

const { validationResult, body, param, query } = require('express-validator');

/**
 * Run validation chains and return 400 on errors
 */
function validate(validations) {
  return async (req, res, next) => {
    for (const validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break;
    }

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  };
}

// Reusable validators
const sanitizeString = (field, location = 'body') => {
  const chain = location === 'param' ? param(field) : location === 'query' ? query(field) : body(field);
  return chain.trim().escape();
};

const isPositiveInt = (field, location = 'query') => {
  const chain = location === 'param' ? param(field) : location === 'query' ? query(field) : body(field);
  return chain.optional().isInt({ min: 0 }).withMessage(`${field} must be a non-negative integer`).toInt();
};

const isValidEmail = (field = 'email') =>
  body(field).isEmail().withMessage('Must be a valid email address').normalizeEmail();

const isValidDate = (field) =>
  body(field).optional({ values: 'null' }).isISO8601().withMessage(`${field} must be a valid ISO 8601 date`);

module.exports = {
  validate,
  sanitizeString,
  isPositiveInt,
  isValidEmail,
  isValidDate,
  body,
  param,
  query
};
