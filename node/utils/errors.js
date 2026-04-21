const crypto = require('crypto');
const logger = require('./logger');

function correlationId() {
  return crypto.randomBytes(8).toString('hex');
}

// Log a server error with a correlation id and send a generic 500 response.
// The client receives the label + correlationId; the full error (message + stack)
// stays server-side so the operator can grep the log by the id the user reports.
function sendServerError(res, label, error, context = {}) {
  const cid = correlationId();
  logger.error(label, {
    correlationId: cid,
    error: error && error.message,
    stack: error && error.stack,
    ...context
  });
  return res.status(500).json({ error: label, correlationId: cid });
}

module.exports = { sendServerError, correlationId };
