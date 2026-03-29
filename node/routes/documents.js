const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'documents');

// Ensure upload directory exists
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const projectDir = path.join(UPLOAD_DIR, req.params.projectId);
    try {
      await fs.mkdir(projectDir, { recursive: true });
      cb(null, projectDir);
    } catch (error) { cb(error); }
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '_' + Math.random().toString(36).substr(2, 6) + ext;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// GET /api/documents/project/:projectId - List documents for a project
router.get('/project/:projectId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ProjectDocuments WHERE project_id = $1 ORDER BY created_at DESC',
      [req.params.projectId]
    );
    res.json({
      documents: result.rows.map(r => ({
        id: r.id,
        projectId: r.project_id,
        title: r.title,
        filename: r.filename,
        originalName: r.original_name,
        mimeType: r.mime_type,
        fileSize: r.file_size,
        uploadedBy: r.uploaded_by,
        createdAt: r.created_at,
      }))
    });
  } catch (error) {
    logger.error('Error fetching documents', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/documents/project/:projectId - Upload document
router.post('/project/:projectId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const title = req.body.title || req.file.originalname;
    const uploadedBy = req.user?.name || req.user?.email || 'Unknown';

    const result = await pool.query(
      `INSERT INTO ProjectDocuments (project_id, title, filename, original_name, mime_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.projectId, title, req.file.filename, req.file.originalname,
       req.file.mimetype, req.file.size, uploadedBy]
    );

    res.status(201).json({ document: result.rows[0] });
  } catch (error) {
    logger.error('Error uploading document', { error: error.message });
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/documents/:id/download - Download a document
router.get('/:id/download', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ProjectDocuments WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const filePath = path.join(UPLOAD_DIR, doc.project_id, doc.filename);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error('Error downloading document', { error: error.message });
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// DELETE /api/documents/:id - Delete a document
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ProjectDocuments WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];

    // Delete file from disk
    try {
      const filePath = path.join(UPLOAD_DIR, doc.project_id, doc.filename);
      await fs.unlink(filePath);
    } catch (e) { /* file may already be gone */ }

    await pool.query('DELETE FROM ProjectDocuments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting document', { error: error.message });
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
