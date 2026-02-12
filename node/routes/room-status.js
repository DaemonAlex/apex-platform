const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { validate, body } = require('../middleware/validate');
const router = express.Router();

// GET /api/room-status - Get all rooms with latest check status
router.get('/', async (req, res) => {
  try {
    // Create Rooms table (permanent room list)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Rooms (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        schedule_day INT NOT NULL,
        schedule_day_name VARCHAR(20) NOT NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create RoomCheckHistory table (audit trail of all checks)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS RoomCheckHistory (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(100) NOT NULL,
        checked_by VARCHAR(255),
        rag_status VARCHAR(20) NOT NULL,
        limited_functionality TEXT,
        non_functional_reason TEXT,
        check_1_video BOOLEAN DEFAULT FALSE,
        check_2_display BOOLEAN DEFAULT FALSE,
        check_3_audio BOOLEAN DEFAULT FALSE,
        check_4_camera BOOLEAN DEFAULT FALSE,
        check_5_network BOOLEAN DEFAULT FALSE,
        notes TEXT,
        checked_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get all non-deleted rooms with their latest check
    const result = await pool.query(`
      SELECT
        r.*,
        h.rag_status,
        h.limited_functionality,
        h.non_functional_reason,
        h.check_1_video,
        h.check_2_display,
        h.check_3_audio,
        h.check_4_camera,
        h.check_5_network,
        h.checked_at as last_checked_at,
        h.checked_by
      FROM Rooms r
      LEFT JOIN (
        SELECT room_id, rag_status, limited_functionality, non_functional_reason,
               check_1_video, check_2_display, check_3_audio, check_4_camera, check_5_network,
               checked_at, checked_by,
               ROW_NUMBER() OVER (PARTITION BY room_id ORDER BY checked_at DESC) as rn
        FROM RoomCheckHistory
      ) h ON r.room_id = h.room_id AND h.rn = 1
      WHERE r.deleted_at IS NULL
      ORDER BY r.schedule_day, r.name
    `);

    const rooms = result.rows.map(row => ({
      id: row.room_id,
      name: row.name,
      scheduleDay: row.schedule_day,
      scheduleDayName: row.schedule_day_name,
      ragStatus: row.rag_status || 'green',
      limitedFunctionality: row.limited_functionality || '',
      nonFunctionalReason: row.non_functional_reason || '',
      checks: [
        { label: 'Video conferencing system powered on and responsive', checked: row.check_1_video || false },
        { label: 'Display(s) showing correct input source', checked: row.check_2_display || false },
        { label: 'Audio (microphone and speakers) functioning properly', checked: row.check_3_audio || false },
        { label: 'Camera operational with proper framing and lighting', checked: row.check_4_camera || false },
        { label: 'Network connectivity stable and tested', checked: row.check_5_network || false }
      ],
      lastCheckedAt: row.last_checked_at,
      lastCheckedBy: row.checked_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    // Connection pool kept open for reuse
    res.json({ rooms });

  } catch (error) {
    logger.error('Error fetching room status', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch room status', details: error.message });
  }
});

// POST /api/room-status - Create new room OR submit check for existing room
router.post('/',
  validate([
    body('checkData.ragStatus').optional().isIn(['green', 'amber', 'red', 'GREEN', 'AMBER', 'RED']).withMessage('RAG status must be green, amber, or red'),
    body('checkData.checks').optional().isArray().withMessage('Checks must be an array'),
    body('room.name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Room name must be 1-255 characters'),
    body('room.scheduleDay').optional().isInt({ min: 0, max: 6 }).withMessage('Schedule day must be 0-6')
  ]),
  async (req, res) => {
  try {
    const { room, checkData } = req.body;

    if (checkData) {
      // This is a check submission for an existing room
      await pool.query(`
        INSERT INTO RoomCheckHistory
          (room_id, checked_by, rag_status, limited_functionality, non_functional_reason,
           check_1_video, check_2_display, check_3_audio, check_4_camera, check_5_network, notes)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        checkData.roomId,
        checkData.checkedBy || 'System',
        checkData.ragStatus,
        checkData.limitedFunctionality || '',
        checkData.nonFunctionalReason || '',
        checkData.checks[0] || false,
        checkData.checks[1] || false,
        checkData.checks[2] || false,
        checkData.checks[3] || false,
        checkData.checks[4] || false,
        checkData.notes || ''
      ]);

      // Connection pool kept open for reuse
      return res.json({ success: true, message: 'Room check recorded successfully' });

    } else if (room) {
      // This is creating a new room — use INSERT ... ON CONFLICT (upsert)
      await pool.query(`
        INSERT INTO Rooms (room_id, name, schedule_day, schedule_day_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (room_id) DO UPDATE SET
          name = EXCLUDED.name,
          schedule_day = EXCLUDED.schedule_day,
          schedule_day_name = EXCLUDED.schedule_day_name,
          updated_at = NOW()
      `, [room.id, room.name, room.scheduleDay, room.scheduleDayName || '']);

      // Connection pool kept open for reuse
      return res.json({ success: true, message: 'Room created successfully' });

    } else {
      // Connection pool kept open for reuse
      return res.status(400).json({ error: 'Invalid request: room or checkData required' });
    }

  } catch (error) {
    logger.error('Error saving room/check', { error: error.message });
    res.status(500).json({ error: 'Failed to save room/check', details: error.message });
  }
});

// GET /api/room-status/:roomId/history - Get check history for a room
router.get('/:roomId/history', async (req, res) => {
  try {
    const { roomId } = req.params;

    const result = await pool.query(`
      SELECT * FROM RoomCheckHistory
      WHERE room_id = $1
      ORDER BY checked_at DESC
    `, [roomId]);

    const history = result.rows.map(row => ({
      id: row.id,
      checkedBy: row.checked_by,
      ragStatus: row.rag_status,
      limitedFunctionality: row.limited_functionality,
      nonFunctionalReason: row.non_functional_reason,
      checks: [row.check_1_video, row.check_2_display, row.check_3_audio, row.check_4_camera, row.check_5_network],
      notes: row.notes,
      checkedAt: row.checked_at
    }));

    // Connection pool kept open for reuse
    res.json({ history });

  } catch (error) {
    logger.error('Error fetching room history', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch room history', details: error.message });
  }
});

// DELETE /api/room-status/:roomId - Soft delete a room (keep all historical data)
router.delete('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    // Soft delete by setting deleted_at timestamp
    await pool.query('UPDATE Rooms SET deleted_at = NOW() WHERE room_id = $1', [roomId]);

    // Connection pool kept open for reuse
    res.json({ success: true, message: 'Room deleted successfully (all check history preserved)' });

  } catch (error) {
    logger.error('Error deleting room', { error: error.message });
    res.status(500).json({ error: 'Failed to delete room', details: error.message });
  }
});

module.exports = router;
