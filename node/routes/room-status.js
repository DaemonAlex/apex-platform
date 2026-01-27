const express = require('express');
const { sql, poolPromise } = require('../db');
const router = express.Router();

// GET /api/room-status - Get all rooms with latest check status
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;

    // Create Rooms table (permanent room list)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Rooms' AND xtype='U')
      BEGIN
        CREATE TABLE Rooms (
          id INT IDENTITY(1,1) PRIMARY KEY,
          room_id NVARCHAR(100) UNIQUE NOT NULL,
          name NVARCHAR(255) NOT NULL,
          schedule_day INT NOT NULL,
          schedule_day_name NVARCHAR(20) NOT NULL,
          deleted_at DATETIME2,
          created_at DATETIME2 DEFAULT GETDATE(),
          updated_at DATETIME2 DEFAULT GETDATE()
        );
      END
    `);

    // Create RoomCheckHistory table (audit trail of all checks)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RoomCheckHistory' AND xtype='U')
      BEGIN
        CREATE TABLE RoomCheckHistory (
          id INT IDENTITY(1,1) PRIMARY KEY,
          room_id NVARCHAR(100) NOT NULL,
          checked_by NVARCHAR(255),
          rag_status NVARCHAR(20) NOT NULL,
          limited_functionality NVARCHAR(MAX),
          non_functional_reason NVARCHAR(MAX),
          check_1_video BIT DEFAULT 0,
          check_2_display BIT DEFAULT 0,
          check_3_audio BIT DEFAULT 0,
          check_4_camera BIT DEFAULT 0,
          check_5_network BIT DEFAULT 0,
          notes NVARCHAR(MAX),
          checked_at DATETIME2 DEFAULT GETDATE()
        );
      END
    `);

    // Get all non-deleted rooms with their latest check
    const result = await pool.request().query(`
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

    const rooms = result.recordset.map(row => ({
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

    await pool.close();
    res.json({ rooms });

  } catch (error) {
    console.error('Error fetching room status:', error);
    res.status(500).json({ error: 'Failed to fetch room status', details: error.message });
  }
});

// POST /api/room-status - Create new room OR submit check for existing room
router.post('/', async (req, res) => {
  try {
    const { room, checkData } = req.body;

    const pool = await poolPromise;

    if (checkData) {
      // This is a check submission for an existing room
      await pool.request()
        .input('room_id', sql.NVarChar, checkData.roomId)
        .input('checked_by', sql.NVarChar, checkData.checkedBy || 'System')
        .input('rag_status', sql.NVarChar, checkData.ragStatus)
        .input('limited_functionality', sql.NVarChar, checkData.limitedFunctionality || '')
        .input('non_functional_reason', sql.NVarChar, checkData.nonFunctionalReason || '')
        .input('check_1_video', sql.Bit, checkData.checks[0] || false)
        .input('check_2_display', sql.Bit, checkData.checks[1] || false)
        .input('check_3_audio', sql.Bit, checkData.checks[2] || false)
        .input('check_4_camera', sql.Bit, checkData.checks[3] || false)
        .input('check_5_network', sql.Bit, checkData.checks[4] || false)
        .input('notes', sql.NVarChar, checkData.notes || '')
        .query(`
          INSERT INTO RoomCheckHistory
            (room_id, checked_by, rag_status, limited_functionality, non_functional_reason,
             check_1_video, check_2_display, check_3_audio, check_4_camera, check_5_network, notes)
          VALUES
            (@room_id, @checked_by, @rag_status, @limited_functionality, @non_functional_reason,
             @check_1_video, @check_2_display, @check_3_audio, @check_4_camera, @check_5_network, @notes)
        `);

      await pool.close();
      return res.json({ success: true, message: 'Room check recorded successfully' });

    } else if (room) {
      // This is creating a new room
      await pool.request()
        .input('room_id', sql.NVarChar, room.id)
        .input('name', sql.NVarChar, room.name)
        .input('schedule_day', sql.Int, room.scheduleDay)
        .input('schedule_day_name', sql.NVarChar, room.scheduleDayName || '')
        .query(`
          MERGE Rooms AS target
          USING (SELECT @room_id AS room_id) AS source
          ON target.room_id = source.room_id
          WHEN MATCHED THEN
            UPDATE SET
              name = @name,
              schedule_day = @schedule_day,
              schedule_day_name = @schedule_day_name,
              updated_at = GETDATE()
          WHEN NOT MATCHED THEN
            INSERT (room_id, name, schedule_day, schedule_day_name)
            VALUES (@room_id, @name, @schedule_day, @schedule_day_name);
        `);

      await pool.close();
      return res.json({ success: true, message: 'Room created successfully' });

    } else {
      await pool.close();
      return res.status(400).json({ error: 'Invalid request: room or checkData required' });
    }

  } catch (error) {
    console.error('Error saving room/check:', error);
    res.status(500).json({ error: 'Failed to save room/check', details: error.message });
  }
});

// GET /api/room-status/:roomId/history - Get check history for a room
router.get('/:roomId/history', async (req, res) => {
  try {
    const { roomId } = req.params;
    const pool = await poolPromise;

    const result = await pool.request()
      .input('room_id', sql.NVarChar, roomId)
      .query(`
        SELECT * FROM RoomCheckHistory
        WHERE room_id = @room_id
        ORDER BY checked_at DESC
      `);

    const history = result.recordset.map(row => ({
      id: row.id,
      checkedBy: row.checked_by,
      ragStatus: row.rag_status,
      limitedFunctionality: row.limited_functionality,
      nonFunctionalReason: row.non_functional_reason,
      checks: [row.check_1_video, row.check_2_display, row.check_3_audio, row.check_4_camera, row.check_5_network],
      notes: row.notes,
      checkedAt: row.checked_at
    }));

    await pool.close();
    res.json({ history });

  } catch (error) {
    console.error('Error fetching room history:', error);
    res.status(500).json({ error: 'Failed to fetch room history', details: error.message });
  }
});

// DELETE /api/room-status/:roomId - Soft delete a room (keep all historical data)
router.delete('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const pool = await poolPromise;

    // Soft delete by setting deleted_at timestamp
    await pool.request()
      .input('room_id', sql.NVarChar, roomId)
      .query('UPDATE Rooms SET deleted_at = GETDATE() WHERE room_id = @room_id');

    await pool.close();
    res.json({ success: true, message: 'Room deleted successfully (all check history preserved)' });

  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room', details: error.message });
  }
});

module.exports = router;
