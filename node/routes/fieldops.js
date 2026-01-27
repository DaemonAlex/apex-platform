const express = require('express');
const router = express.Router();

// Simple working fieldops route for now
router.get('/health', (req, res) => {
  res.json({ status: 'fieldops route working' });
});

module.exports = router;