const express = require('express');
const { sql, poolPromise } = require('../db');
const router = express.Router();

// Create audit log entry
router.post('/log', async (req, res) => {
  try {
    const { 
      user, 
      action, 
      resource, 
      details, 
      projectId, 
      taskId, 
      category = 'general',
      severity = 'info',
      ipAddress = req.ip || '127.0.0.1'
    } = req.body;

    const pool = await poolPromise;
    
    // Insert audit log entry
    await pool.request()
      .input('id', sql.NVarChar, `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
      .input('timestamp', sql.DateTime, new Date())
      .input('user', sql.NVarChar, user || 'System')
      .input('action', sql.NVarChar, action)
      .input('resource', sql.NVarChar, resource || '')
      .input('details', sql.NVarChar, details || '')
      .input('projectId', sql.NVarChar, projectId || null)
      .input('taskId', sql.NVarChar, taskId || null)
      .input('category', sql.NVarChar, category)
      .input('severity', sql.NVarChar, severity)
      .input('ipAddress', sql.NVarChar, ipAddress)
      .query(`
        INSERT INTO AuditLog (id, timestamp, [user], action, resource, details, projectId, taskId, category, severity, ipAddress, created_at)
        VALUES (@id, @timestamp, @user, @action, @resource, @details, @projectId, @taskId, @category, @severity, @ipAddress, GETDATE())
      `);

    res.json({ message: 'Audit log entry created successfully' });
    
    // Connection pool kept open for reuse
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ error: 'Failed to create audit log entry', details: error.message });
  }
});

// Get audit log entries
router.get('/log', async (req, res) => {
  try {
    const { limit = 100, offset = 0, projectId, category, severity } = req.query;
    
    const pool = await poolPromise;
    
    let query = 'SELECT * FROM AuditLog WHERE 1=1';
    const request = pool.request();
    
    if (projectId) {
      query += ' AND projectId = @projectId';
      request.input('projectId', sql.NVarChar, projectId);
    }
    
    if (category) {
      query += ' AND category = @category';
      request.input('category', sql.NVarChar, category);
    }
    
    if (severity) {
      query += ' AND severity = @severity';
      request.input('severity', sql.NVarChar, severity);
    }
    
    query += ' ORDER BY timestamp DESC';
    query += ` OFFSET ${parseInt(offset)} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`;
    
    const result = await request.query(query);
    
    res.json({
      auditLog: result.recordset,
      total: result.recordset.length
    });
    
    // Connection pool kept open for reuse
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit log', details: error.message });
  }
});

module.exports = router;