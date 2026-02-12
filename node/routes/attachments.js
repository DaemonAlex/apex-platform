const express = require('express');
const router = express.Router();
const multer = require('multer');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');

// Validate JWT_SECRET is set
if (!process.env.JWT_SECRET) {
    logger.error('❌ CRITICAL: JWT_SECRET environment variable is not set in attachments.js');
    process.exit(1);
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
    // Accept token from header OR query parameter (query param for download links)
    const token = req.headers['x-auth-token'] || req.query.token;
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const taskId = req.params.taskId;
        const uploadPath = path.join('/app/uploads/tasks', taskId);

        try {
            await fs.mkdir(uploadPath, { recursive: true });
            cb(null, uploadPath);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        // Generate unique filename: timestamp_originalname
        const timestamp = Date.now();
        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${sanitizedFilename}`);
    }
});

// File filter - only allow images and PDFs
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|heic|webp|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only images (JPEG, PNG, HEIC, WebP) and PDF files are allowed'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 10 // Max 10 files at once
    },
    fileFilter: fileFilter
});

// POST /api/attachments/:taskId - Upload files to a task
router.post('/:taskId', authenticateToken, upload.array('files', 10), async (req, res) => {
    try {
        const { taskId } = req.params;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        // Return file metadata
        const attachments = files.map(file => ({
            filename: file.filename,
            originalName: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            uploadedBy: req.user.email || req.user.name,
            uploadedAt: new Date().toISOString(),
            url: `/api/attachments/${taskId}/${file.filename}`
        }));

        res.status(201).json({
            success: true,
            message: `${files.length} file(s) uploaded successfully`,
            attachments
        });

    } catch (error) {
        logger.error('Upload error:', error);
        res.status(500).json({
            error: 'File upload failed',
            message: error.message
        });
    }
});

// GET /api/attachments/:taskId - List all attachments for a task
router.get('/:taskId', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const uploadPath = path.join('/app/uploads/tasks', taskId);

        try {
            const files = await fs.readdir(uploadPath);

            const attachments = await Promise.all(files.map(async (filename) => {
                const filePath = path.join(uploadPath, filename);
                const stats = await fs.stat(filePath);

                return {
                    filename: filename,
                    size: stats.size,
                    uploadedAt: stats.mtime.toISOString(), // Use mtime (modification time) - more reliable than birthtime
                    url: `/api/attachments/${taskId}/${filename}`
                };
            }));

            res.json({ attachments });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.json({ attachments: [] });
            }
            throw error;
        }

    } catch (error) {
        logger.error('List attachments error:', error);
        res.status(500).json({ error: 'Failed to list attachments' });
    }
});

// GET /api/attachments/:taskId/:filename - Download a specific file
router.get('/:taskId/:filename', authenticateToken, async (req, res) => {
    try {
        const { taskId, filename } = req.params;
        const filePath = path.join('/app/uploads/tasks', taskId, filename);

        // Security check - prevent directory traversal
        const normalizedPath = path.normalize(filePath);
        if (!normalizedPath.startsWith('/app/uploads/tasks/')) {
            return res.status(403).json({ error: 'Access denied' });
        }

        try {
            await fs.access(filePath);
            res.sendFile(filePath);
        } catch (error) {
            res.status(404).json({ error: 'File not found' });
        }

    } catch (error) {
        logger.error('Download error:', error);
        res.status(500).json({ error: 'File download failed' });
    }
});

// DELETE /api/attachments/:taskId/:filename - Delete a specific file
router.delete('/:taskId/:filename', authenticateToken, async (req, res) => {
    try {
        const { taskId, filename } = req.params;
        const filePath = path.join('/app/uploads/tasks', taskId, filename);

        // Security check - prevent directory traversal
        const normalizedPath = path.normalize(filePath);
        if (!normalizedPath.startsWith('/app/uploads/tasks/')) {
            return res.status(403).json({ error: 'Access denied' });
        }

        try {
            await fs.unlink(filePath);
            res.json({
                success: true,
                message: 'File deleted successfully'
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ error: 'File not found' });
            }
            throw error;
        }

    } catch (error) {
        logger.error('Delete error:', error);
        res.status(500).json({ error: 'File deletion failed' });
    }
});

// Multer error handling middleware
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        // Multer-specific errors
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large',
                message: 'File size must be less than 10MB'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Too many files',
                message: 'Maximum 10 files can be uploaded at once'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                error: 'Unexpected file',
                message: 'Unexpected file field in upload'
            });
        }
        return res.status(400).json({
            error: 'Upload error',
            message: error.message
        });
    } else if (error.message && error.message.includes('Only images')) {
        // File filter rejection
        return res.status(400).json({
            error: 'Invalid file type',
            message: error.message
        });
    }

    // Pass other errors to default handler
    next(error);
});

module.exports = router;
