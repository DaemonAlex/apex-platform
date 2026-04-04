const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { auditLog } = require('../middleware/audit');
const { validate, body } = require('../middleware/validate');
const router = express.Router();

// Ensure all room tables exist (auto-migration)
async function ensureRoomTables() {
  // Locations (buildings/branches)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Locations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address VARCHAR(500),
      city VARCHAR(100),
      state VARCHAR(50),
      zip VARCHAR(20),
      contact_name VARCHAR(255),
      contact_phone VARCHAR(50),
      contact_email VARCHAR(255),
      notes TEXT,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Floors within a location
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Floors (
      id SERIAL PRIMARY KEY,
      location_id INT NOT NULL REFERENCES Locations(id),
      name VARCHAR(50) NOT NULL,
      sort_order INT DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Core rooms table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Rooms (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      schedule_day INT NOT NULL DEFAULT 1,
      schedule_day_name VARCHAR(20) NOT NULL DEFAULT '',
      check_frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
      check_day INT,
      room_type VARCHAR(50),
      capacity INT,
      location VARCHAR(255),
      floor VARCHAR(50),
      location_id INT,
      floor_id INT,
      standard_id INT,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add columns if they don't exist (for existing installs)
  const newCols = [
    { name: 'room_type', type: 'VARCHAR(50)' },
    { name: 'capacity', type: 'INT' },
    { name: 'location', type: 'VARCHAR(255)' },
    { name: 'floor', type: 'VARCHAR(50)' },
    { name: 'standard_id', type: 'INT' },
    { name: 'location_id', type: 'INT' },
    { name: 'floor_id', type: 'INT' },
    { name: 'check_frequency', type: "VARCHAR(20) DEFAULT 'weekly'" },
    { name: 'check_day', type: 'INT' }
  ];
  for (const col of newCols) {
    await pool.query(`
      ALTER TABLE Rooms ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}
    `).catch(() => {});
  }

  // Check history - each row is one room check by a tech
  await pool.query(`
    CREATE TABLE IF NOT EXISTS RoomCheckHistory (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(100) NOT NULL,
      checked_by VARCHAR(255) NOT NULL,
      rag_status VARCHAR(20) NOT NULL DEFAULT 'green',
      issue_found BOOLEAN DEFAULT FALSE,
      issue_description TEXT,
      ticket_number VARCHAR(100),
      check_1_video BOOLEAN DEFAULT FALSE,
      check_2_display BOOLEAN DEFAULT FALSE,
      check_3_audio BOOLEAN DEFAULT FALSE,
      check_4_camera BOOLEAN DEFAULT FALSE,
      check_5_network BOOLEAN DEFAULT FALSE,
      notes TEXT,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add new columns to existing check history table
  for (const col of [
    { name: 'issue_found', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'issue_description', type: 'TEXT' },
    { name: 'ticket_number', type: 'VARCHAR(100)' }
  ]) {
    await pool.query(`ALTER TABLE RoomCheckHistory ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`).catch(() => {});
  }

  // Equipment inventory per room
  await pool.query(`
    CREATE TABLE IF NOT EXISTS RoomEquipment (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      make VARCHAR(100),
      model VARCHAR(150),
      serial_number VARCHAR(100),
      firmware_version VARCHAR(50),
      install_date DATE,
      warranty_end DATE,
      status VARCHAR(50) DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Room standards (what equipment a room type SHOULD have)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS RoomStandards (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      required_equipment JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Room technical details - the "room passport"
  await pool.query(`
    CREATE TABLE IF NOT EXISTS RoomTechDetails (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(100) NOT NULL UNIQUE,
      platform VARCHAR(50),
      platform_version VARCHAR(50),
      cisco_workspace_id VARCHAR(100),
      cisco_activation_code VARCHAR(100),
      cisco_device_serial VARCHAR(100),
      cisco_registration_status VARCHAR(50),
      network_jacks JSONB DEFAULT '[]',
      devices JSONB DEFAULT '[]',
      cable_runs JSONB DEFAULT '[]',
      credentials JSONB DEFAULT '[]',
      vlan VARCHAR(50),
      switch_name VARCHAR(100),
      switch_port VARCHAR(50),
      poe_status VARCHAR(50),
      wifi_ssid VARCHAR(100),
      notes TEXT,
      updated_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Documents - polymorphic attachment to rooms, projects, vendors, equipment
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Documents (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(100) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_size INTEGER,
      mime_type VARCHAR(100),
      doc_type VARCHAR(50) DEFAULT 'other',
      description TEXT,
      uploaded_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

let tablesEnsured = false;

// GET /api/room-status - Get all rooms with latest check status
router.get('/', async (req, res) => {
  try {
    if (!tablesEnsured) { await ensureRoomTables(); tablesEnsured = true; }

    // Get all non-deleted rooms with latest check + equipment count + location/floor
    const result = await pool.query(`
      SELECT
        r.*,
        l.name as loc_name, l.address as loc_address, l.city as loc_city,
        f.name as floor_name,
        h.rag_status,
        h.limited_functionality,
        h.non_functional_reason,
        h.check_1_video,
        h.check_2_display,
        h.check_3_audio,
        h.check_4_camera,
        h.check_5_network,
        h.issue_found,
        h.issue_description,
        h.ticket_number,
        h.checked_at as last_checked_at,
        h.checked_by,
        COALESCE(eq.equipment_count, 0) as equipment_count,
        s.name as standard_name
      FROM Rooms r
      LEFT JOIN Locations l ON r.location_id = l.id
      LEFT JOIN Floors f ON r.floor_id = f.id
      LEFT JOIN (
        SELECT room_id, rag_status, limited_functionality, non_functional_reason,
               check_1_video, check_2_display, check_3_audio, check_4_camera, check_5_network,
               issue_found, issue_description, ticket_number,
               checked_at, checked_by,
               ROW_NUMBER() OVER (PARTITION BY room_id ORDER BY checked_at DESC) as rn
        FROM RoomCheckHistory
      ) h ON r.room_id = h.room_id AND h.rn = 1
      LEFT JOIN (
        SELECT room_id, COUNT(*) as equipment_count FROM RoomEquipment WHERE status = 'active' GROUP BY room_id
      ) eq ON r.room_id = eq.room_id
      LEFT JOIN RoomStandards s ON r.standard_id = s.id
      WHERE r.deleted_at IS NULL
      ORDER BY l.name, f.name, r.name
    `);

    const rooms = result.rows.map(row => {
      const lastChecked = row.last_checked_at ? new Date(row.last_checked_at) : null;
      const freq = row.check_frequency || 'weekly';
      let nextDue = null;
      if (lastChecked) {
        nextDue = new Date(lastChecked);
        if (freq === 'daily') nextDue.setDate(nextDue.getDate() + 1);
        else if (freq === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
        else if (freq === 'biweekly') nextDue.setDate(nextDue.getDate() + 14);
        else if (freq === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1);
      }
      const now = new Date();
      const isOverdue = lastChecked ? (nextDue && nextDue < now) : true; // never checked = overdue

      return {
        id: row.room_id,
        name: row.name,
        checkFrequency: freq,
        checkDay: row.check_day,
        roomType: row.room_type || null,
        capacity: row.capacity || null,
        locationId: row.location_id || null,
        location: row.loc_name || row.location || null,
        floorId: row.floor_id || null,
        floor: row.floor_name || row.floor || null,
        standardId: row.standard_id || null,
        standardName: row.standard_name || null,
        equipmentCount: parseInt(row.equipment_count),
        ragStatus: row.rag_status || 'green',
        issueFound: row.issue_found || false,
        issueDescription: row.issue_description || '',
        ticketNumber: row.ticket_number || '',
        lastCheckedAt: row.last_checked_at,
        lastCheckedBy: row.checked_by,
        nextDue: nextDue ? nextDue.toISOString() : null,
        isOverdue,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

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
  auditLog('Room created or check submitted', 'room', 'info'),
  async (req, res) => {
  try {
    const { room, checkData } = req.body;

    if (checkData) {
      // Tech submitting a room check
      if (!checkData.checkedBy) return res.status(400).json({ error: 'checkedBy is required' });
      if (!checkData.roomId) return res.status(400).json({ error: 'roomId is required' });

      await pool.query(`
        INSERT INTO RoomCheckHistory
          (room_id, checked_by, rag_status, issue_found, issue_description, ticket_number,
           check_1_video, check_2_display, check_3_audio, check_4_camera, check_5_network, notes)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        checkData.roomId,
        checkData.checkedBy,
        checkData.ragStatus || 'green',
        checkData.issueFound || false,
        checkData.issueDescription || null,
        checkData.ticketNumber || null,
        checkData.checks?.[0] || false,
        checkData.checks?.[1] || false,
        checkData.checks?.[2] || false,
        checkData.checks?.[3] || false,
        checkData.checks?.[4] || false,
        checkData.notes || null
      ]);

      return res.json({ success: true, message: 'Room check recorded' });

    } else if (room) {
      // This is creating a new room - use INSERT ... ON CONFLICT (upsert)
      await pool.query(`
        INSERT INTO Rooms (room_id, name, schedule_day, schedule_day_name, check_frequency, check_day, room_type, capacity, location, floor, location_id, floor_id, standard_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (room_id) DO UPDATE SET
          name = EXCLUDED.name,
          schedule_day = EXCLUDED.schedule_day,
          schedule_day_name = EXCLUDED.schedule_day_name,
          check_frequency = EXCLUDED.check_frequency,
          check_day = EXCLUDED.check_day,
          room_type = EXCLUDED.room_type,
          capacity = EXCLUDED.capacity,
          location = EXCLUDED.location,
          floor = EXCLUDED.floor,
          location_id = EXCLUDED.location_id,
          floor_id = EXCLUDED.floor_id,
          standard_id = EXCLUDED.standard_id,
          updated_at = NOW()
      `, [room.id, room.name, room.scheduleDay || 1, room.scheduleDayName || '',
          room.checkFrequency || 'weekly', room.checkDay || null,
          room.roomType || null, room.capacity || null, room.location || null,
          room.floor || null, room.locationId || null, room.floorId || null,
          room.standardId || null]);

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
      issueFound: row.issue_found || false,
      issueDescription: row.issue_description || '',
      ticketNumber: row.ticket_number || '',
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

// PUT /api/room-status/:roomId - Update a room
router.put('/:roomId', auditLog('Room updated', 'room', 'info'), async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, roomType, capacity, locationId, floorId, standardId, checkFrequency, checkDay } = req.body;

    // Build dynamic SET clause
    const sets = [];
    const vals = [];
    let i = 1;
    if (name !== undefined)           { sets.push(`name = $${i++}`); vals.push(name); }
    if (roomType !== undefined)       { sets.push(`room_type = $${i++}`); vals.push(roomType); }
    if (capacity !== undefined)       { sets.push(`capacity = $${i++}`); vals.push(capacity); }
    if (locationId !== undefined)     { sets.push(`location_id = $${i++}`); vals.push(locationId); }
    if (floorId !== undefined)        { sets.push(`floor_id = $${i++}`); vals.push(floorId); }
    if (standardId !== undefined)     { sets.push(`standard_id = $${i++}`); vals.push(standardId || null); }
    if (checkFrequency !== undefined) { sets.push(`check_frequency = $${i++}`); vals.push(checkFrequency); }
    if (checkDay !== undefined)       { sets.push(`check_day = $${i++}`); vals.push(checkDay); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    sets.push(`updated_at = NOW()`);
    vals.push(roomId);

    const result = await pool.query(
      `UPDATE Rooms SET ${sets.join(', ')} WHERE room_id = $${i} AND deleted_at IS NULL RETURNING *`,
      vals
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Room not found' });

    // Sync text location/floor fields
    if (locationId || floorId) {
      await pool.query(`
        UPDATE Rooms r SET
          location = COALESCE(l.name, '') || CASE WHEN f.name IS NOT NULL THEN ' - Floor ' || f.name ELSE '' END,
          floor = f.name
        FROM Locations l
        LEFT JOIN Floors f ON f.id = r.floor_id
        WHERE l.id = r.location_id AND r.room_id = $1
      `, [roomId]);
    }

    res.json({ success: true, room: result.rows[0] });
  } catch (error) {
    logger.error('Error updating room', { error: error.message });
    res.status(500).json({ error: 'Failed to update room', details: error.message });
  }
});

// DELETE /api/room-status/:roomId - Soft delete a room (keep all historical data)
router.delete('/:roomId', auditLog('Room deleted', 'room', 'warning'), async (req, res) => {
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

// ==================== LOCATIONS ====================

// GET /api/room-status/locations - List all locations with floor counts
router.get('/locations/list', async (req, res) => {
  try {
    if (!tablesEnsured) { await ensureRoomTables(); tablesEnsured = true; }
    const result = await pool.query(`
      SELECT l.*, COUNT(DISTINCT f.id) as floor_count, COUNT(DISTINCT r.room_id) as room_count
      FROM Locations l
      LEFT JOIN Floors f ON f.location_id = l.id
      LEFT JOIN Rooms r ON r.location_id = l.id AND r.deleted_at IS NULL
      WHERE l.deleted_at IS NULL
      GROUP BY l.id
      ORDER BY l.name
    `);
    res.json({ locations: result.rows.map(r => ({
      id: r.id,
      name: r.name,
      address: r.address,
      city: r.city,
      state: r.state,
      zip: r.zip,
      contactName: r.contact_name,
      contactPhone: r.contact_phone,
      contactEmail: r.contact_email,
      notes: r.notes,
      floorCount: parseInt(r.floor_count),
      roomCount: parseInt(r.room_count)
    }))});
  } catch (error) {
    logger.error('Error fetching locations', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// POST /api/room-status/locations - Create a location
router.post('/locations', auditLog('Location created', 'room', 'info'), async (req, res) => {
  try {
    if (!tablesEnsured) { await ensureRoomTables(); tablesEnsured = true; }
    const { name, address, city, state, zip, contactName, contactPhone, contactEmail, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Location name is required' });
    const result = await pool.query(
      `INSERT INTO Locations (name, address, city, state, zip, contact_name, contact_phone, contact_email, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, address || null, city || null, state || null, zip || null,
       contactName || null, contactPhone || null, contactEmail || null, notes || null]
    );
    res.status(201).json({ location: result.rows[0] });
  } catch (error) {
    logger.error('Error creating location', { error: error.message });
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// PUT /api/room-status/locations/:id - Update a location
router.put('/locations/:id', auditLog('Location updated', 'room', 'info'), async (req, res) => {
  try {
    const { name, address, city, state, zip, contactName, contactPhone, contactEmail, notes } = req.body;
    await pool.query(
      `UPDATE Locations SET name = COALESCE($1, name), address = $2, city = $3, state = $4, zip = $5,
       contact_name = $6, contact_phone = $7, contact_email = $8, notes = $9, updated_at = NOW() WHERE id = $10`,
      [name, address, city, state, zip, contactName, contactPhone, contactEmail, notes, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating location', { error: error.message });
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// DELETE /api/room-status/locations/:id - Soft delete a location
router.delete('/locations/:id', auditLog('Location deleted', 'room', 'warning'), async (req, res) => {
  try {
    await pool.query('UPDATE Locations SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting location', { error: error.message });
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// ==================== FLOORS ====================

// GET /api/room-status/locations/:locationId/floors - Floors for a location
router.get('/locations/:locationId/floors', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, COUNT(r.room_id) as room_count
       FROM Floors f
       LEFT JOIN Rooms r ON r.floor_id = f.id AND r.deleted_at IS NULL
       WHERE f.location_id = $1
       GROUP BY f.id
       ORDER BY f.sort_order, f.name`,
      [req.params.locationId]
    );
    res.json({ floors: result.rows.map(r => ({
      id: r.id,
      locationId: r.location_id,
      name: r.name,
      sortOrder: r.sort_order,
      notes: r.notes,
      roomCount: parseInt(r.room_count)
    }))});
  } catch (error) {
    logger.error('Error fetching floors', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch floors' });
  }
});

// POST /api/room-status/locations/:locationId/floors - Add a floor
router.post('/locations/:locationId/floors', auditLog('Floor created', 'room', 'info'), async (req, res) => {
  try {
    const { name, sortOrder, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Floor name is required' });
    const result = await pool.query(
      'INSERT INTO Floors (location_id, name, sort_order, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.locationId, name, sortOrder || 0, notes || null]
    );
    res.status(201).json({ floor: result.rows[0] });
  } catch (error) {
    logger.error('Error creating floor', { error: error.message });
    res.status(500).json({ error: 'Failed to create floor' });
  }
});

// DELETE /api/room-status/floors/:id - Delete a floor
router.delete('/floors/:id', auditLog('Floor deleted', 'room', 'warning'), async (req, res) => {
  try {
    // Unlink rooms from this floor
    await pool.query('UPDATE Rooms SET floor_id = NULL WHERE floor_id = $1', [req.params.id]);
    await pool.query('DELETE FROM Floors WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting floor', { error: error.message });
    res.status(500).json({ error: 'Failed to delete floor' });
  }
});

// ==================== ROOM EQUIPMENT ====================

// GET /api/room-status/:roomId/equipment - Get equipment for a room
router.get('/:roomId/equipment', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM RoomEquipment WHERE room_id = $1 ORDER BY category, make, model',
      [req.params.roomId]
    );
    res.json({ equipment: result.rows.map(r => ({
      id: r.id,
      roomId: r.room_id,
      category: r.category,
      make: r.make,
      model: r.model,
      serialNumber: r.serial_number,
      firmwareVersion: r.firmware_version,
      installDate: r.install_date,
      warrantyEnd: r.warranty_end,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at
    }))});
  } catch (error) {
    logger.error('Error fetching equipment', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

// POST /api/room-status/:roomId/equipment - Add equipment to a room
router.post('/:roomId/equipment', auditLog('Equipment added', 'room', 'info'), async (req, res) => {
  try {
    const { category, make, model, serialNumber, firmwareVersion, installDate, warrantyEnd, status, notes } = req.body;
    const result = await pool.query(`
      INSERT INTO RoomEquipment (room_id, category, make, model, serial_number, firmware_version, install_date, warranty_end, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [req.params.roomId, category, make || null, model || null, serialNumber || null,
        firmwareVersion || null, installDate || null, warrantyEnd || null, status || 'active', notes || null]);
    res.status(201).json({ equipment: result.rows[0] });
  } catch (error) {
    logger.error('Error adding equipment', { error: error.message });
    res.status(500).json({ error: 'Failed to add equipment' });
  }
});

// PUT /api/room-status/equipment/:id - Update equipment
router.put('/equipment/:id', auditLog('Equipment updated', 'room', 'info'), async (req, res) => {
  try {
    const { category, make, model, serialNumber, firmwareVersion, installDate, warrantyEnd, status, notes } = req.body;
    await pool.query(`
      UPDATE RoomEquipment SET
        category = COALESCE($1, category), make = COALESCE($2, make), model = COALESCE($3, model),
        serial_number = COALESCE($4, serial_number), firmware_version = COALESCE($5, firmware_version),
        install_date = COALESCE($6, install_date), warranty_end = COALESCE($7, warranty_end),
        status = COALESCE($8, status), notes = COALESCE($9, notes), updated_at = NOW()
      WHERE id = $10
    `, [category, make, model, serialNumber, firmwareVersion, installDate, warrantyEnd, status, notes, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating equipment', { error: error.message });
    res.status(500).json({ error: 'Failed to update equipment' });
  }
});

// DELETE /api/room-status/equipment/:id - Remove equipment
router.delete('/equipment/:id', auditLog('Equipment deleted', 'room', 'warning'), async (req, res) => {
  try {
    await pool.query('DELETE FROM RoomEquipment WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting equipment', { error: error.message });
    res.status(500).json({ error: 'Failed to delete equipment' });
  }
});

// ==================== ROOM STANDARDS ====================

// GET /api/room-status/standards - Get all room standards
router.get('/standards/list', async (req, res) => {
  try {
    if (!tablesEnsured) { await ensureRoomTables(); tablesEnsured = true; }
    const result = await pool.query('SELECT * FROM RoomStandards ORDER BY name');
    res.json({ standards: result.rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      requiredEquipment: r.required_equipment || [],
      createdAt: r.created_at
    }))});
  } catch (error) {
    logger.error('Error fetching standards', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch standards' });
  }
});

// POST /api/room-status/standards - Create a room standard
router.post('/standards', auditLog('Room standard created', 'room', 'info'), async (req, res) => {
  try {
    const { name, description, requiredEquipment } = req.body;
    const result = await pool.query(
      'INSERT INTO RoomStandards (name, description, required_equipment) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, JSON.stringify(requiredEquipment || [])]
    );
    res.status(201).json({ standard: result.rows[0] });
  } catch (error) {
    logger.error('Error creating standard', { error: error.message });
    res.status(500).json({ error: 'Failed to create standard' });
  }
});

// PUT /api/room-status/standards/:id - Update a room standard
router.put('/standards/:id', auditLog('Room standard updated', 'room', 'info'), async (req, res) => {
  try {
    const { name, description, requiredEquipment } = req.body;
    await pool.query(
      'UPDATE RoomStandards SET name = COALESCE($1, name), description = COALESCE($2, description), required_equipment = COALESCE($3, required_equipment), updated_at = NOW() WHERE id = $4',
      [name, description, requiredEquipment ? JSON.stringify(requiredEquipment) : null, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating standard', { error: error.message });
    res.status(500).json({ error: 'Failed to update standard' });
  }
});

// DELETE /api/room-status/standards/:id - Delete a room standard
router.delete('/standards/:id', auditLog('Room standard deleted', 'room', 'warning'), async (req, res) => {
  try {
    await pool.query('UPDATE Rooms SET standard_id = NULL WHERE standard_id = $1', [req.params.id]);
    await pool.query('DELETE FROM RoomStandards WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting standard', { error: error.message });
    res.status(500).json({ error: 'Failed to delete standard' });
  }
});

// ==================== COMPLIANCE ====================

// GET /api/room-status/compliance - Room compliance scorecard
router.get('/compliance/scorecard', async (req, res) => {
  try {
    if (!tablesEnsured) { await ensureRoomTables(); tablesEnsured = true; }

    // Get all rooms with their standard, equipment, and latest check status
    const roomsResult = await pool.query(`
      SELECT r.room_id, r.name, r.room_type, r.location, r.standard_id,
             s.name as standard_name, s.required_equipment,
             lc.rag_status, lc.checked_at
      FROM Rooms r
      LEFT JOIN RoomStandards s ON r.standard_id = s.id
      LEFT JOIN LATERAL (
        SELECT rag_status, checked_at FROM RoomCheckHistory
        WHERE room_id = r.room_id ORDER BY checked_at DESC LIMIT 1
      ) lc ON true
      WHERE r.deleted_at IS NULL
    `);

    const equipmentResult = await pool.query(`
      SELECT room_id, category, make, model FROM RoomEquipment WHERE status = 'active'
    `);

    // Group equipment by room
    const equipByRoom = {};
    equipmentResult.rows.forEach(e => {
      if (!equipByRoom[e.room_id]) equipByRoom[e.room_id] = [];
      equipByRoom[e.room_id].push(e);
    });

    let atStandard = 0, belowStandard = 0, noStandard = 0, totalRooms = roomsResult.rows.length;

    const rooms = roomsResult.rows.map(room => {
      if (!room.standard_id || !room.required_equipment) {
        noStandard++;
        return { id: room.room_id, name: room.name, location: room.location, roomType: room.room_type, compliance: 'no-standard', standardName: null, missing: [], ragStatus: room.rag_status || null };
      }

      const required = typeof room.required_equipment === 'string' ? JSON.parse(room.required_equipment) : room.required_equipment;
      const installed = equipByRoom[room.room_id] || [];

      // Check each required item
      const missing = [];
      required.forEach(req => {
        const found = installed.some(e =>
          e.category === req.category &&
          (!req.make || e.make?.toLowerCase() === req.make.toLowerCase()) &&
          (!req.model || e.model?.toLowerCase().includes(req.model.toLowerCase()))
        );
        if (!found) missing.push(req);
      });

      if (missing.length === 0) {
        atStandard++;
        return { id: room.room_id, name: room.name, location: room.location, roomType: room.room_type, compliance: 'at-standard', standardName: room.standard_name, missing: [], ragStatus: room.rag_status || null };
      } else {
        belowStandard++;
        return { id: room.room_id, name: room.name, location: room.location, roomType: room.room_type, compliance: 'below-standard', standardName: room.standard_name, missing, ragStatus: room.rag_status || null };
      }
    });

    res.json({
      summary: { total: totalRooms, atStandard, belowStandard, noStandard },
      rooms
    });
  } catch (error) {
    logger.error('Error generating compliance scorecard', { error: error.message });
    res.status(500).json({ error: 'Failed to generate compliance scorecard' });
  }
});

// ==================== ROOM TECH DETAILS ====================

// GET /api/room-status/:roomId/tech - Get technical details for a room
router.get('/:roomId/tech', async (req, res) => {
  try {
    if (!tablesEnsured) { await ensureRoomTables(); tablesEnsured = true; }
    const { roomId } = req.params;
    const result = await pool.query('SELECT * FROM RoomTechDetails WHERE room_id = $1', [roomId]);
    if (result.rows.length === 0) {
      // Return empty shell so UI can render form
      return res.json({
        roomId,
        platform: null, platformVersion: null,
        ciscoWorkspaceId: null, ciscoActivationCode: null, ciscoDeviceSerial: null, ciscoRegistrationStatus: null,
        networkJacks: [], devices: [], cableRuns: [], credentials: [],
        vlan: null, switchName: null, switchPort: null, poeStatus: null, wifiSsid: null,
        notes: null, updatedBy: null, updatedAt: null,
        ceilingType: null, ceilingHeight: null, tableType: null, tableSeats: null,
        existingAv: null, cablePathways: null, powerLocations: null,
        mountingSurfaces: null, roomDimensions: null, vendorAccessNotes: null,
      });
    }
    const r = result.rows[0];
    res.json({
      id: r.id, roomId: r.room_id,
      platform: r.platform, platformVersion: r.platform_version,
      ciscoWorkspaceId: r.cisco_workspace_id, ciscoActivationCode: r.cisco_activation_code,
      ciscoDeviceSerial: r.cisco_device_serial, ciscoRegistrationStatus: r.cisco_registration_status,
      networkJacks: r.network_jacks || [], devices: r.devices || [],
      cableRuns: r.cable_runs || [], credentials: r.credentials || [],
      vlan: r.vlan, switchName: r.switch_name, switchPort: r.switch_port,
      poeStatus: r.poe_status, wifiSsid: r.wifi_ssid,
      notes: r.notes, updatedBy: r.updated_by, updatedAt: r.updated_at,
      ceilingType: r.ceiling_type, ceilingHeight: r.ceiling_height,
      tableType: r.table_type, tableSeats: r.table_seats,
      existingAv: r.existing_av, cablePathways: r.cable_pathways,
      powerLocations: r.power_locations, mountingSurfaces: r.mounting_surfaces,
      roomDimensions: r.room_dimensions, vendorAccessNotes: r.vendor_access_notes,
    });
  } catch (error) {
    logger.error('Error fetching room tech details', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch tech details' });
  }
});

// PUT /api/room-status/:roomId/tech - Create or update tech details
router.put('/:roomId/tech', auditLog('Room tech details updated', 'room', 'info'), async (req, res) => {
  try {
    const { roomId } = req.params;
    const {
      platform, platformVersion,
      ciscoWorkspaceId, ciscoActivationCode, ciscoDeviceSerial, ciscoRegistrationStatus,
      networkJacks, devices, cableRuns, credentials,
      vlan, switchName, switchPort, poeStatus, wifiSsid,
      notes,
      ceilingType, ceilingHeight, tableType, tableSeats,
      existingAv, cablePathways, powerLocations, mountingSurfaces,
      roomDimensions, vendorAccessNotes,
    } = req.body;

    const userName = req.user?.name || req.user?.email || 'Unknown';

    const result = await pool.query(`
      INSERT INTO RoomTechDetails (room_id, platform, platform_version,
        cisco_workspace_id, cisco_activation_code, cisco_device_serial, cisco_registration_status,
        network_jacks, devices, cable_runs, credentials,
        vlan, switch_name, switch_port, poe_status, wifi_ssid,
        notes, updated_by, updated_at,
        ceiling_type, ceiling_height, table_type, table_seats,
        existing_av, cable_pathways, power_locations, mounting_surfaces,
        room_dimensions, vendor_access_notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(),
              $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      ON CONFLICT (room_id) DO UPDATE SET
        platform = COALESCE(EXCLUDED.platform, RoomTechDetails.platform),
        platform_version = COALESCE(EXCLUDED.platform_version, RoomTechDetails.platform_version),
        cisco_workspace_id = COALESCE(EXCLUDED.cisco_workspace_id, RoomTechDetails.cisco_workspace_id),
        cisco_activation_code = COALESCE(EXCLUDED.cisco_activation_code, RoomTechDetails.cisco_activation_code),
        cisco_device_serial = COALESCE(EXCLUDED.cisco_device_serial, RoomTechDetails.cisco_device_serial),
        cisco_registration_status = COALESCE(EXCLUDED.cisco_registration_status, RoomTechDetails.cisco_registration_status),
        network_jacks = COALESCE(EXCLUDED.network_jacks, RoomTechDetails.network_jacks),
        devices = COALESCE(EXCLUDED.devices, RoomTechDetails.devices),
        cable_runs = COALESCE(EXCLUDED.cable_runs, RoomTechDetails.cable_runs),
        credentials = COALESCE(EXCLUDED.credentials, RoomTechDetails.credentials),
        vlan = COALESCE(EXCLUDED.vlan, RoomTechDetails.vlan),
        switch_name = COALESCE(EXCLUDED.switch_name, RoomTechDetails.switch_name),
        switch_port = COALESCE(EXCLUDED.switch_port, RoomTechDetails.switch_port),
        poe_status = COALESCE(EXCLUDED.poe_status, RoomTechDetails.poe_status),
        wifi_ssid = COALESCE(EXCLUDED.wifi_ssid, RoomTechDetails.wifi_ssid),
        notes = COALESCE(EXCLUDED.notes, RoomTechDetails.notes),
        ceiling_type = COALESCE(EXCLUDED.ceiling_type, RoomTechDetails.ceiling_type),
        ceiling_height = COALESCE(EXCLUDED.ceiling_height, RoomTechDetails.ceiling_height),
        table_type = COALESCE(EXCLUDED.table_type, RoomTechDetails.table_type),
        table_seats = COALESCE(EXCLUDED.table_seats, RoomTechDetails.table_seats),
        existing_av = COALESCE(EXCLUDED.existing_av, RoomTechDetails.existing_av),
        cable_pathways = COALESCE(EXCLUDED.cable_pathways, RoomTechDetails.cable_pathways),
        power_locations = COALESCE(EXCLUDED.power_locations, RoomTechDetails.power_locations),
        mounting_surfaces = COALESCE(EXCLUDED.mounting_surfaces, RoomTechDetails.mounting_surfaces),
        room_dimensions = COALESCE(EXCLUDED.room_dimensions, RoomTechDetails.room_dimensions),
        vendor_access_notes = COALESCE(EXCLUDED.vendor_access_notes, RoomTechDetails.vendor_access_notes),
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `, [
      roomId, platform || null, platformVersion || null,
      ciscoWorkspaceId || null, ciscoActivationCode || null, ciscoDeviceSerial || null, ciscoRegistrationStatus || null,
      JSON.stringify(networkJacks || []), JSON.stringify(devices || []),
      JSON.stringify(cableRuns || []), JSON.stringify(credentials || []),
      vlan || null, switchName || null, switchPort || null, poeStatus || null, wifiSsid || null,
      notes || null, userName,
      ceilingType || null, ceilingHeight || null, tableType || null, tableSeats || null,
      existingAv || null, cablePathways || null, powerLocations || null, mountingSurfaces || null,
      roomDimensions || null, vendorAccessNotes || null,
    ]);

    res.json({ success: true, techDetails: result.rows[0] });
  } catch (error) {
    logger.error('Error saving room tech details', { error: error.message });
    res.status(500).json({ error: 'Failed to save tech details' });
  }
});

// ==================== DOCUMENTS ====================

const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')),
});
const docUpload = multer({ storage: docStorage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB max

// GET /api/room-status/documents/:entityType/:entityId - List documents
router.get('/documents/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const result = await pool.query(
      'SELECT * FROM Documents WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC',
      [entityType, entityId]
    );
    res.json({
      documents: result.rows.map(d => ({
        id: d.id, entityType: d.entity_type, entityId: d.entity_id,
        filename: d.filename, originalName: d.original_name,
        fileSize: d.file_size, mimeType: d.mime_type,
        docType: d.doc_type, description: d.description,
        uploadedBy: d.uploaded_by, createdAt: d.created_at,
      })),
    });
  } catch (error) {
    logger.error('Error fetching documents', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/room-status/documents/:entityType/:entityId - Upload document
router.post('/documents/:entityType/:entityId', docUpload.single('file'), auditLog('Document uploaded', 'room', 'info'), async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { docType, description } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const userName = req.user?.name || req.user?.email || 'Unknown';

    const result = await pool.query(
      `INSERT INTO Documents (entity_type, entity_id, filename, original_name, file_size, mime_type, doc_type, description, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [entityType, entityId, file.filename, file.originalname, file.size, file.mimetype, docType || 'other', description || null, userName]
    );

    res.json({ success: true, document: result.rows[0] });
  } catch (error) {
    logger.error('Error uploading document', { error: error.message });
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/room-status/documents/download/:id - Download a document
router.get('/documents/download/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Documents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];
    const filePath = path.join(uploadDir, doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    logger.error('Error downloading document', { error: error.message });
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// DELETE /api/room-status/documents/:id - Delete a document
router.delete('/documents/:id', auditLog('Document deleted', 'room', 'warning'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Documents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];
    // Remove file from disk
    const filePath = path.join(uploadDir, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM Documents WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting document', { error: error.message });
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
