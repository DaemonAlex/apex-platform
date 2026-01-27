const express = require('express');
const { sql, poolPromise } = require('../db');
const router = express.Router();

// Load Wintrust sample data and clear localhost data
router.post('/migrate-wintrust-data', async (req, res) => {
  try {
    console.log('🔄 Migrating Wintrust data to container database...');
    
    // Connect to container database
    const containerPool = await poolPromise;
    
    // First, clear existing projects in container
    console.log('Clearing existing container projects...');
    await containerPool.request().query('DELETE FROM Projects');
    
    // Connect to localhost database to get the sample data
    const localConfig = {
      user: 'SA',
      password: 'ApexProd2024!',
      server: 'localhost',
      port: 1433,
      database: 'APEX_PROD',
      options: {
        encrypt: false,
        trustServerCertificate: true
      }
    };
    
    const localPool = await sql.connect(localConfig);
    
    // Get all projects from localhost
    console.log('Reading projects from localhost database...');
    const localProjects = await localPool.request()
      .query('SELECT * FROM Projects ORDER BY created_at');
    
    console.log(`Found ${localProjects.recordset.length} projects to migrate`);
    
    // Insert each project into container database
    let migratedCount = 0;
    for (const project of localProjects.recordset) {
      await containerPool.request()
        .input('id', sql.NVarChar, project.id)
        .input('name', sql.NVarChar, project.name)
        .input('client', sql.NVarChar, project.client)
        .input('type', sql.NVarChar, project.type)
        .input('status', sql.NVarChar, project.status)
        .input('budget', sql.Decimal(12,2), project.budget)
        .input('actualBudget', sql.Decimal(12,2), project.actualBudget)
        .input('estimatedBudget', sql.Decimal(12,2), project.estimatedBudget || project.budget)
        .input('startDate', sql.DateTime2, project.startDate)
        .input('endDate', sql.DateTime2, project.endDate)
        .input('progress', sql.Decimal(5,2), project.progress || 0)
        .input('requestorInfo', sql.NVarChar, project.requestorInfo || '')
        .input('businessLine', sql.NVarChar, project.businessLine || project.client)
        .input('siteLocation', sql.NVarChar, project.siteLocation || '')
        .input('description', sql.NVarChar, project.description)
        .input('tasks', sql.NVarChar, project.tasks)
        .query(`
          INSERT INTO Projects (
            id, name, client, type, status, budget, actualBudget, estimatedBudget,
            startDate, endDate, progress, requestorInfo, businessLine, siteLocation,
            description, tasks, created_at, updated_at
          ) VALUES (
            @id, @name, @client, @type, @status, @budget, @actualBudget, @estimatedBudget,
            @startDate, @endDate, @progress, @requestorInfo, @businessLine, @siteLocation,
            @description, @tasks, GETDATE(), GETDATE()
          )
        `);
      
      migratedCount++;
      console.log(`Migrated: ${project.name}`);
    }
    
    await localPool.close();
    await containerPool.close();
    
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