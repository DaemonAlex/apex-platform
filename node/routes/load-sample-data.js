const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// Load Wintrust sample data and clear localhost data
router.post('/migrate-wintrust-data', async (req, res) => {
  try {
    console.log('🔄 Migrating Wintrust data to container database...');

    // Connect to container database
    const containerPool = pool;

    // First, clear existing projects in container
    console.log('Clearing existing container projects...');
    await containerPool.query('DELETE FROM Projects');

    // Connect to localhost database to get the sample data
    const { Pool } = require('pg');
    const localPool = new Pool({
      user: 'SA',
      password: 'ApexProd2024!',
      host: 'localhost',
      port: 5432,
      database: 'APEX_PROD',
    });

    // Get all projects from localhost
    console.log('Reading projects from localhost database...');
    const localProjects = await localPool.query('SELECT * FROM Projects ORDER BY created_at');

    console.log(`Found ${localProjects.rows.length} projects to migrate`);

    // Insert each project into container database
    let migratedCount = 0;
    for (const project of localProjects.rows) {
      await containerPool.query(`
        INSERT INTO Projects (
          id, name, client, type, status, budget, actualBudget, estimatedBudget,
          startDate, endDate, progress, requestorInfo, businessLine, siteLocation,
          description, tasks, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, NOW(), NOW()
        )
      `, [
        project.id,
        project.name,
        project.client,
        project.type,
        project.status,
        project.budget,
        project.actualBudget,
        project.estimatedBudget || project.budget,
        project.startDate,
        project.endDate,
        project.progress || 0,
        project.requestorInfo || '',
        project.businessLine || project.client,
        project.siteLocation || '',
        project.description,
        project.tasks
      ]);

      migratedCount++;
      console.log(`Migrated: ${project.name}`);
    }

    await localPool.end();

    // Return success - frontend can then clear localhost data
    res.json({
      success: true,
      message: `Successfully migrated ${migratedCount} projects to container database`,
      migratedCount,
      instruction: 'Ready to clear localhost database and sample files'
    });

  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({
      error: 'Failed to migrate Wintrust data',
      details: error.message
    });
  }
});

module.exports = router;
