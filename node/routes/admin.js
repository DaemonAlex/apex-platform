const express = require('express');
const { sql, poolPromise } = require('../db');
const router = express.Router();

// Fix active projects with realistic task data
router.post('/fix-active-projects', async (req, res) => {
  try {
    console.log('🔧 Fixing active projects with realistic data...');
    const pool = await poolPromise;
    
    // Wintrust data
    const wintrustData = {
      'Wintrust Barrington Branch - Drive-Thru Modernization': {
        requestorInfo: 'Michelle Taylor, Branch Manager',
        siteLocation: '100 S. Cook Street, Barrington, IL 60010',
        businessLine: 'Wintrust Bank - Barrington Branch'
      }
      // Add other projects as needed
    };
    
    // Task templates by phase
    const taskTemplates = {
      1: [
        { name: 'Site Survey and Assessment', requiresFieldOps: true },
        { name: 'Equipment Procurement and Delivery', requiresFieldOps: false },
        { name: 'Permits and Documentation', requiresFieldOps: false },
        { name: 'Customer Requirements Review', requiresFieldOps: false }
      ],
      2: [
        { name: 'Cable Infrastructure Installation', requiresFieldOps: true },
        { name: 'Rack and Equipment Mounting', requiresFieldOps: true },
        { name: 'Initial Equipment Configuration', requiresFieldOps: true },
        { name: 'Network Integration Setup', requiresFieldOps: true }
      ],
      3: [
        { name: 'System Commissioning and Testing', requiresFieldOps: true },
        { name: 'Audio Calibration and Tuning', requiresFieldOps: true },
        { name: 'Video Display Alignment', requiresFieldOps: true },
        { name: 'User Interface Programming', requiresFieldOps: true },
        { name: 'Integration Testing', requiresFieldOps: true }
      ],
      4: [
        { name: 'Staff Training and Documentation', requiresFieldOps: true },
        { name: 'Final Customer Walkthrough', requiresFieldOps: true },
        { name: 'Warranty Registration', requiresFieldOps: false },
        { name: 'Project Closeout Documentation', requiresFieldOps: false }
      ]
    };
    
    const technicians = ['Mike Rodriguez', 'Sarah Chen', 'David Park', 'Tom Wilson', 'Lisa Martinez'];
    
    // Generate realistic tasks
    function generateRealisticTasks() {
      const tasks = [];
      const currentDate = new Date();
      const projectPhase = Math.floor(Math.random() * 2) + 2; // Phase 2 or 3
      
      for (let phase = 1; phase <= 4; phase++) {
        const phaseTemplates = taskTemplates[phase];
        
        phaseTemplates.forEach((template, taskIndex) => {
          const taskId = `task_${phase}_${taskIndex}_${Date.now()}`;
          let status, fieldOps = {}, notes = [];
          
          if (phase < projectPhase) {
            status = Math.random() < 0.9 ? 'completed' : 'in-progress';
          } else if (phase === projectPhase) {
            const rand = Math.random();
            if (rand < 0.3) status = 'completed';
            else if (rand < 0.6) status = 'in-progress';
            else if (rand < 0.8) status = 'scheduled';
            else status = 'pending';
          } else {
            status = Math.random() < 0.8 ? 'pending' : 'scheduled';
          }
          
          if (template.requiresFieldOps && (status === 'scheduled' || status === 'in-progress')) {
            const daysOut = Math.floor(Math.random() * 14) + 1;
            const schedDate = new Date(currentDate);
            schedDate.setDate(schedDate.getDate() + daysOut);
            
            fieldOps = {
              scheduledDate: schedDate.toISOString().split('T')[0],
              scheduledTime: ['08:00', '09:30', '11:00', '13:30', '15:00'][Math.floor(Math.random() * 5)],
              technician: technicians[Math.floor(Math.random() * technicians.length)],
              estimatedDuration: Math.floor(Math.random() * 6) + 2,
              specialRequirements: 'Coordinate with bank security for access',
              status: 'scheduled'
            };
          }
          
          if (status === 'in-progress') {
            notes.push({
              id: `note_${Date.now()}_${taskIndex}`,
              author: technicians[Math.floor(Math.random() * technicians.length)],
              content: 'Work in progress. Equipment installed, working on configuration.',
              timestamp: new Date(currentDate - Math.random() * 2 * 24 * 60 * 60 * 1000).toISOString(),
              isInternal: Math.random() < 0.3
            });
          }
          
          tasks.push({
            id: taskId,
            name: template.name,
            phase: phase,
            status: status,
            priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
            assignedTo: technicians[Math.floor(Math.random() * technicians.length)],
            estimatedHours: Math.floor(Math.random() * 12) + 4,
            actualHours: status === 'completed' ? Math.floor(Math.random() * 12) + 4 : null,
            createdAt: new Date(currentDate - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(currentDate - Math.random() * 1 * 24 * 60 * 60 * 1000).toISOString(),
            fieldOperations: fieldOps,
            notesThread: notes
          });
        });
      }
      
      return tasks;
    }
    
    // Get all active projects
    const activeProjects = await pool.request()
      .query("SELECT id, name, budget FROM Projects WHERE status = 'active'");
    
    let updatedCount = 0;
    
    for (const project of activeProjects.recordset) {
      console.log(`Updating: ${project.name}`);
      
      const newTasks = generateRealisticTasks();
      const progress = Math.round((newTasks.filter(t => t.status === 'completed').length / newTasks.length) * 100);
      const projectData = wintrustData[project.name];
      
      await pool.request()
        .input('id', sql.NVarChar, project.id)
        .input('tasks', sql.NVarChar, JSON.stringify(newTasks))
        .input('progress', sql.Decimal(5,2), progress)
        .input('requestorInfo', sql.NVarChar, projectData?.requestorInfo || 'N/A')
        .input('businessLine', sql.NVarChar, projectData?.businessLine || 'N/A')
        .input('siteLocation', sql.NVarChar, projectData?.siteLocation || 'N/A')
        .input('estimatedBudget', sql.Decimal(12,2), project.budget || 0)
        .query(`
          UPDATE Projects 
          SET tasks = @tasks, 
              progress = @progress,
              requestorInfo = @requestorInfo,
              businessLine = @businessLine,
              siteLocation = @siteLocation,
              estimatedBudget = @estimatedBudget,
              updated_at = GETDATE()
          WHERE id = @id
        `);
      
      updatedCount++;
    }
    
    await pool.close();
    
    res.json({ 
      success: true, 
      message: `Updated ${updatedCount} active projects with realistic task data`,
      updatedCount 
    });
    
  } catch (error) {
    console.error('Error fixing active projects:', error);
    res.status(500).json({ 
      error: 'Failed to fix active projects', 
      details: error.message 
    });
  }
});

// Load comprehensive Wintrust dataset
router.post('/load-full-wintrust-data', async (req, res) => {
  try {
    console.log('🏦 Loading comprehensive Wintrust dataset...');
    const pool = await poolPromise;
    
    // Clear existing projects
    await pool.request().query('DELETE FROM Projects');
    
    // Comprehensive Wintrust Bank Projects
    const projects = [
      // ACTIVE PROJECTS
      {
        id: 'WTB_001',
        name: 'Wintrust Naperville Downtown Branch - New Construction AV',
        client: 'Wintrust Bank - Naperville Downtown',
        type: 'new-branch-buildout',
        status: 'active',
        budget: 185000,
        actualBudget: 142500,
        estimatedBudget: 185000,
        startDate: '2025-01-03',
        endDate: '2025-03-15',
        progress: 65,
        requestorInfo: 'Jennifer Walsh, Branch Manager',
        businessLine: 'Wintrust Bank - Naperville Downtown Branch',
        siteLocation: '123 Main Street, Naperville, IL 60540',
        description: 'Complete AV installation for new Naperville downtown branch including teller digital signage, customer information displays, conference room AV, and security integration.'
      },
      {
        id: 'WTB_002',
        name: 'Wintrust Corporate HQ - Executive Conference Center',
        client: 'Wintrust Financial Corporation',
        type: 'conference-center',
        status: 'active',
        budget: 320000,
        actualBudget: 280000,
        estimatedBudget: 320000,
        startDate: '2025-02-01',
        endDate: '2025-04-30',
        progress: 45,
        requestorInfo: 'Michael Thompson, VP Facilities',
        businessLine: 'Wintrust Financial Corporation - Corporate Headquarters',
        siteLocation: '9700 W. Higgins Road, Rosemont, IL 60018',
        description: 'Executive conference center with state-of-the-art video conferencing, wireless presentation systems, and integrated room control.'
      },
      {
        id: 'WTB_003',
        name: 'Wintrust Multi-Branch Digital Signage Standardization',
        client: 'Wintrust Financial Corporation',
        type: 'digital-signage',
        status: 'active',
        budget: 450000,
        actualBudget: 285000,
        estimatedBudget: 450000,
        startDate: '2025-01-15',
        endDate: '2025-06-30',
        progress: 35,
        requestorInfo: 'Sarah Martinez, Regional Operations Manager',
        businessLine: 'Wintrust Financial Corporation - Regional Operations',
        siteLocation: 'Multiple Locations - Chicago Metro Area',
        description: 'Standardization of digital signage systems across 25 Wintrust Bank locations with centralized content management.'
      },
      {
        id: 'WTB_004',
        name: 'Wintrust Barrington Branch - Drive-Thru Modernization',
        client: 'Wintrust Bank - Barrington',
        type: 'drive-thru-modernization',
        status: 'active',
        budget: 125000,
        actualBudget: 78000,
        estimatedBudget: 125000,
        startDate: '2025-07-31',
        endDate: '2025-09-30',
        progress: 55,
        requestorInfo: 'Michelle Taylor, Branch Manager',
        businessLine: 'Wintrust Bank - Barrington Branch',
        siteLocation: '100 S. Cook Street, Barrington, IL 60010',
        description: 'Complete modernization of drive-thru banking experience with updated video displays, audio systems, and customer interface technology.'
      },
      // COMPLETED PROJECTS
      {
        id: 'WTB_005',
        name: 'Wintrust Lincoln Park Branch - Lobby Renovation AV',
        client: 'Wintrust Bank - Lincoln Park',
        type: 'branch-renovation',
        status: 'completed',
        budget: 95000,
        actualBudget: 92000,
        estimatedBudget: 95000,
        startDate: '2024-11-01',
        endDate: '2025-01-15',
        progress: 100,
        requestorInfo: 'David Chen, Branch Manager',
        businessLine: 'Wintrust Bank - Lincoln Park Branch',
        siteLocation: '2000 N. Lincoln Avenue, Chicago, IL 60614',
        description: 'Lobby renovation with updated customer information displays, queue management system, and ambient audio.'
      },
      {
        id: 'WTB_006',
        name: 'Wintrust Corporate Training Center - AV Modernization',
        client: 'Wintrust Financial Corporation',
        type: 'training-facility',
        status: 'completed',
        budget: 150000,
        actualBudget: 148500,
        estimatedBudget: 150000,
        startDate: '2024-10-01',
        endDate: '2024-12-20',
        progress: 100,
        requestorInfo: 'Lisa Rodriguez, Director of Learning & Development',
        businessLine: 'Wintrust Financial Corporation - Training Center',
        siteLocation: '231 S. LaSalle Street, Chicago, IL 60604',
        description: 'Complete modernization of corporate training facility with interactive displays, video conferencing, and recording capabilities.'
      },
      // SCHEDULED PROJECTS
      {
        id: 'WTB_007',
        name: 'Wintrust Crystal Lake Branch - Customer Experience Upgrade',
        client: 'Wintrust Bank - Crystal Lake',
        type: 'customer-experience',
        status: 'scheduled',
        budget: 120000,
        actualBudget: 0,
        estimatedBudget: 120000,
        startDate: '2025-04-01',
        endDate: '2025-06-15',
        progress: 0,
        requestorInfo: 'Robert Kim, Branch Manager',
        businessLine: 'Wintrust Bank - Crystal Lake Branch',
        siteLocation: '450 W. Virginia Street, Crystal Lake, IL 60014',
        description: 'Customer experience enhancement with interactive kiosks, updated digital signage, and improved audio systems.'
      },
      {
        id: 'WTB_008',
        name: 'Wintrust Libertyville Branch - Lobby Modernization',
        client: 'Wintrust Bank - Libertyville',
        type: 'branch-renovation',
        status: 'scheduled',
        budget: 95000,
        actualBudget: 0,
        estimatedBudget: 95000,
        startDate: '2025-05-01',
        endDate: '2025-07-15',
        progress: 0,
        requestorInfo: 'Amanda Foster, Branch Manager',
        businessLine: 'Wintrust Bank - Libertyville Branch',
        siteLocation: '1401 S. Milwaukee Avenue, Libertyville, IL 60048',
        description: 'Modern lobby design with digital displays, improved lighting, and background music system.'
      }
    ];
    
    let insertedCount = 0;
    for (const project of projects) {
      await pool.request()
        .input('id', sql.NVarChar, project.id)
        .input('name', sql.NVarChar, project.name)
        .input('client', sql.NVarChar, project.client)
        .input('type', sql.NVarChar, project.type)
        .input('status', sql.NVarChar, project.status)
        .input('budget', sql.Decimal(12,2), project.budget)
        .input('actualBudget', sql.Decimal(12,2), project.actualBudget)
        .input('estimatedBudget', sql.Decimal(12,2), project.estimatedBudget)
        .input('startDate', sql.DateTime2, new Date(project.startDate))
        .input('endDate', sql.DateTime2, new Date(project.endDate))
        .input('progress', sql.Decimal(5,2), project.progress)
        .input('requestorInfo', sql.NVarChar, project.requestorInfo)
        .input('businessLine', sql.NVarChar, project.businessLine)
        .input('siteLocation', sql.NVarChar, project.siteLocation)
        .input('description', sql.NVarChar, project.description)
        .input('tasks', sql.NVarChar, '[]')
        .query(`
          INSERT INTO Projects (
            id, name, client, type, status, budget, actualBudget, estimatedBudget,
            startDate, endDate, progress, requestorInfo, businessLine, siteLocation,
            description, tasks
          ) VALUES (
            @id, @name, @client, @type, @status, @budget, @actualBudget, @estimatedBudget,
            @startDate, @endDate, @progress, @requestorInfo, @businessLine, @siteLocation,
            @description, @tasks
          )
        `);
      
      insertedCount++;
      console.log(`✅ Loaded: ${project.name}`);
    }
    
    await pool.close();
    
    res.json({
      success: true,
      message: `Successfully loaded ${insertedCount} Wintrust projects`,
      insertedCount,
      breakdown: {
        active: projects.filter(p => p.status === 'active').length,
        completed: projects.filter(p => p.status === 'completed').length,
        scheduled: projects.filter(p => p.status === 'scheduled').length
      }
    });
    
  } catch (error) {
    console.error('Error loading Wintrust data:', error);
    res.status(500).json({ error: 'Failed to load Wintrust data', details: error.message });
  }
});

// Add time tracking columns to database
router.post('/add-time-tracking', async (req, res) => {
  let pool;
  try {
    pool = await poolPromise;
    
    // Check if columns already exist
    const checkColumns = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Projects' 
      AND COLUMN_NAME IN ('estimatedHours', 'actualHours', 'timeEntries')
    `);
    
    if (checkColumns.recordset[0].count < 3) {
      // Add time tracking columns
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Projects' AND COLUMN_NAME = 'estimatedHours')
          ALTER TABLE Projects ADD estimatedHours DECIMAL(10,2);
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Projects' AND COLUMN_NAME = 'actualHours')
          ALTER TABLE Projects ADD actualHours DECIMAL(10,2);
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Projects' AND COLUMN_NAME = 'timeEntries')
          ALTER TABLE Projects ADD timeEntries NVARCHAR(MAX);
      `);
    }
    
    res.json({ message: 'Time tracking columns added successfully' });
  } catch (error) {
    console.error('Error adding time tracking columns:', error);
    res.status(500).json({ error: 'Failed to add time tracking columns', details: error.message });
  } finally {
    if (pool) await pool.close();
  }
});

// Update projects with time tracking data
router.post('/update-time-tracking', async (req, res) => {
  let pool;
  try {
    pool = await poolPromise;
    
    // Get all projects
    const projects = await pool.request().query('SELECT * FROM Projects');
    
    for (const project of projects.recordset) {
      let tasks = project.tasks ? JSON.parse(project.tasks) : [];
      let totalEstimatedHours = 0;
      let totalActualHours = 0;
      
      // Add time tracking to tasks
      tasks = tasks.map(task => {
        // Add estimated hours based on task type
        if (!task.estimatedHours) {
          switch(task.name.toLowerCase()) {
            case 'site survey':
            case 'initial site visit':
              task.estimatedHours = 4;
              break;
            case 'equipment delivery':
            case 'cable pull':
              task.estimatedHours = 8;
              break;
            case 'display installation':
            case 'audio system setup':
            case 'control system programming':
              task.estimatedHours = 16;
              break;
            case 'system testing':
            case 'user training':
              task.estimatedHours = 6;
              break;
            case 'documentation':
              task.estimatedHours = 3;
              break;
            default:
              task.estimatedHours = 4;
          }
        }
        
        // Add actual hours based on status
        if (!task.actualHours) {
          if (task.status === 'completed') {
            task.actualHours = task.estimatedHours * (0.8 + Math.random() * 0.4); // 80-120% of estimate
          } else if (task.status === 'in-progress') {
            task.actualHours = task.estimatedHours * (0.3 + Math.random() * 0.4); // 30-70% of estimate
          } else {
            task.actualHours = 0;
          }
        }
        
        totalEstimatedHours += task.estimatedHours || 0;
        totalActualHours += task.actualHours || 0;
        
        return task;
      });
      
      // Generate sample time entries
      const timeEntries = [];
      if (project.status === 'active' || project.status === 'completed') {
        // Add some sample time entries
        const daysAgo = Math.floor(Math.random() * 30);
        for (let i = 0; i < Math.min(5, tasks.filter(t => t.actualHours > 0).length); i++) {
          timeEntries.push({
            id: `TE_${project.id}_${i}`,
            date: new Date(Date.now() - (daysAgo - i) * 24 * 60 * 60 * 1000).toISOString(),
            employee: ['John Smith', 'Mike Johnson', 'Sarah Davis', 'Tom Wilson'][Math.floor(Math.random() * 4)],
            hours: 2 + Math.floor(Math.random() * 6),
            description: `Work on ${tasks.filter(t => t.actualHours > 0)[i]?.name || 'project tasks'}`,
            taskId: tasks.filter(t => t.actualHours > 0)[i]?.id
          });
        }
      }
      
      // Update project with time tracking data
      await pool.request()
        .input('id', sql.NVarChar, project.id)
        .input('tasks', sql.NVarChar, JSON.stringify(tasks))
        .input('estimatedHours', sql.Decimal(10,2), Math.round(totalEstimatedHours * 100) / 100)
        .input('actualHours', sql.Decimal(10,2), Math.round(totalActualHours * 100) / 100)
        .input('timeEntries', sql.NVarChar, JSON.stringify(timeEntries))
        .query(`
          UPDATE Projects 
          SET tasks = @tasks,
              estimatedHours = @estimatedHours,
              actualHours = @actualHours,
              timeEntries = @timeEntries
          WHERE id = @id
        `);
    }
    
    res.json({ message: 'Time tracking data updated successfully', projectsUpdated: projects.recordset.length });
  } catch (error) {
    console.error('Error updating time tracking:', error);
    res.status(500).json({ error: 'Failed to update time tracking', details: error.message });
  } finally {
    if (pool) await pool.close();
  }
});

// Add RAG status columns and calculate RAG status for all projects
router.post('/add-rag-status', async (req, res) => {
  try {
    console.log('🚦 Adding RAG status calculations...');
    const pool = await poolPromise;
    
    // Add RAG status columns if they don't exist
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Projects' AND COLUMN_NAME = 'ragStatus')
        BEGIN
          ALTER TABLE Projects ADD ragStatus NVARCHAR(10);
        END
      `);
      
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Projects' AND COLUMN_NAME = 'ragReason')
        BEGIN
          ALTER TABLE Projects ADD ragReason NVARCHAR(255);
        END
      `);
      
      console.log('✅ RAG status columns added');
    } catch (columnError) {
      console.log('RAG columns may already exist, continuing...');
    }
    
    // RAG Status Calculation Logic
    function calculateProjectRAG(project) {
      const now = new Date();
      const endDate = new Date(project.endDate);
      const startDate = new Date(project.startDate);
      const projectDuration = endDate - startDate;
      const elapsed = now - startDate;
      const timeProgress = Math.max(0, Math.min(100, (elapsed / projectDuration) * 100));
      
      const tasks = JSON.parse(project.tasks || '[]');
      const progress = project.progress || 0;
      
      // Calculate task-level issues
      const overdueTasks = tasks.filter(task => {
        if (task.dueDate && task.status !== 'completed') {
          return new Date(task.dueDate) < now;
        }
        return false;
      }).length;
      
      const blockedTasks = tasks.filter(task => 
        task.status === 'pending' && (task.notesThread || []).some(note => 
          note.content.toLowerCase().includes('blocked') || 
          note.content.toLowerCase().includes('waiting')
        )
      ).length;
      
      // Calculate budget variance
      const budgetVariance = project.actualBudget > 0 ? 
        ((project.actualBudget - project.budget) / project.budget) * 100 : 0;
      
      // RAG Logic
      let ragStatus = 'GREEN';
      let ragReason = 'Project on track';
      
      // RED conditions (critical issues)
      if (project.status === 'active' && endDate < now) {
        ragStatus = 'RED';
        ragReason = 'Project overdue';
      } else if (budgetVariance > 20) {
        ragStatus = 'RED';
        ragReason = `Budget overrun: ${budgetVariance.toFixed(1)}%`;
      } else if (overdueTasks > 0 && progress < 80) {
        ragStatus = 'RED';
        ragReason = `${overdueTasks} overdue tasks`;
      } else if (blockedTasks >= 3) {
        ragStatus = 'RED';
        ragReason = `${blockedTasks} blocked tasks`;
      }
      // AMBER conditions (warning signs)
      else if (project.status === 'active' && timeProgress > progress + 15) {
        ragStatus = 'AMBER';
        ragReason = `Behind schedule: ${timeProgress.toFixed(0)}% time vs ${progress}% progress`;
      } else if (budgetVariance > 10) {
        ragStatus = 'AMBER';
        ragReason = `Budget variance: ${budgetVariance.toFixed(1)}%`;
      } else if (overdueTasks > 0) {
        ragStatus = 'AMBER';
        ragReason = `${overdueTasks} overdue task(s)`;
      } else if (blockedTasks > 0) {
        ragStatus = 'AMBER';
        ragReason = `${blockedTasks} blocked task(s)`;
      } else if (project.status === 'active' && timeProgress > progress + 5) {
        ragStatus = 'AMBER';
        ragReason = 'Slightly behind schedule';
      }
      
      return { ragStatus, ragReason };
    }
    
    function calculateTaskRAG(task) {
      const now = new Date();
      let ragStatus = 'GREEN';
      let ragReason = 'Task on track';
      
      // Task-specific RAG logic
      if (task.status === 'completed') {
        ragStatus = 'GREEN';
        ragReason = 'Task completed';
      } else if (task.dueDate && new Date(task.dueDate) < now) {
        ragStatus = 'RED';
        ragReason = 'Task overdue';
      } else if (task.status === 'pending' && (task.notesThread || []).some(note => 
        note.content.toLowerCase().includes('blocked') || 
        note.content.toLowerCase().includes('issue')
      )) {
        ragStatus = 'RED';
        ragReason = 'Task blocked';
      } else if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const daysToDeadline = (dueDate - now) / (1000 * 60 * 60 * 24);
        
        if (daysToDeadline <= 1 && task.status !== 'completed') {
          ragStatus = 'AMBER';
          ragReason = 'Due soon';
        } else if (daysToDeadline <= 3 && task.status === 'pending') {
          ragStatus = 'AMBER';
          ragReason = 'Not started, due soon';
        }
      }
      
      return { ragStatus, ragReason };
    }
    
    // Get all projects and update RAG status
    const projects = await pool.request().query('SELECT * FROM Projects');
    let updatedCount = 0;
    
    for (const project of projects.recordset) {
      const rag = calculateProjectRAG(project);
      
      // Update tasks with RAG status
      const tasks = JSON.parse(project.tasks || '[]');
      const updatedTasks = tasks.map(task => ({
        ...task,
        ...calculateTaskRAG(task)
      }));
      
      // Update project with RAG status
      await pool.request()
        .input('id', sql.NVarChar, project.id)
        .input('ragStatus', sql.NVarChar, rag.ragStatus)
        .input('ragReason', sql.NVarChar, rag.ragReason)
        .input('tasks', sql.NVarChar, JSON.stringify(updatedTasks))
        .query(`
          UPDATE Projects 
          SET ragStatus = @ragStatus, ragReason = @ragReason, tasks = @tasks, updated_at = GETDATE()
          WHERE id = @id
        `);
      
      updatedCount++;
      console.log(`✅ ${project.name}: ${rag.ragStatus} - ${rag.ragReason}`);
    }
    
    await pool.close();
    
    res.json({
      success: true,
      message: `Updated RAG status for ${updatedCount} projects`,
      updatedCount
    });
    
  } catch (error) {
    console.error('Error adding RAG status:', error);
    res.status(500).json({ error: 'Failed to add RAG status', details: error.message });
  }
});

// Reload clean project data
router.post('/reload-projects', async (req, res) => {
  let pool;
  try {
    pool = await poolPromise;
    
    // Get only legitimate project records
    const result = await pool.request().query(`
      SELECT * FROM Projects 
      WHERE id LIKE 'WTB_%' 
      ORDER BY created_at DESC
    `);
    
    const projects = result.recordset.map(project => ({
      ...project,
      tasks: project.tasks ? JSON.parse(project.tasks) : []
    }));
    
    res.json({ projects });
  } catch (error) {
    console.error('Error reloading projects:', error);
    res.status(500).json({ error: 'Failed to reload projects', details: error.message });
  } finally {
    if (pool) await pool.close();
  }
});

// Clean up corrupted database records
router.post('/cleanup-database', async (req, res) => {
  let pool;
  try {
    pool = await poolPromise;
    
    // First, let's see what we have
    const allRecords = await pool.request().query('SELECT TOP 20 id, name FROM Projects ORDER BY created_at DESC');
    console.log('Sample records:', allRecords.recordset);
    
    // Delete all records that don't have WTB_ IDs (these are corrupted task/note records)
    const result = await pool.request().query(`
      DELETE FROM Projects 
      WHERE id NOT LIKE 'WTB_%'
    `);
    
    console.log(`Deleted ${result.rowsAffected[0]} corrupted records`);
    
    // Count remaining projects
    const countResult = await pool.request().query('SELECT COUNT(*) as count FROM Projects');
    const projectCount = countResult.recordset[0].count;
    
    res.json({ 
      message: 'Database cleanup completed successfully', 
      deletedRecords: result.rowsAffected[0],
      remainingProjects: projectCount,
      sampleRecords: allRecords.recordset
    });
  } catch (error) {
    console.error('Error cleaning up database:', error);
    res.status(500).json({ error: 'Failed to cleanup database', details: error.message });
  } finally {
    if (pool) await pool.close();
  }
});

// Clean up unwanted user accounts (keep only superadmin)
router.post('/cleanup-users', async (req, res) => {
  try {
    console.log('🗑️ Cleaning up unwanted user accounts...');
    const pool = await poolPromise;

    // Get current users to show what we're deleting
    const currentUsers = await pool.request().query('SELECT id, name, email, role FROM Users');
    console.log('Current users:', currentUsers.recordset);

    // Delete all users except the superadmin account we just created (admin@apex.local)
    const deleteResult = await pool.request()
      .query(`DELETE FROM Users WHERE email != 'admin@apex.local'`);

    console.log(`🗑️ Deleted ${deleteResult.rowsAffected[0]} unwanted accounts`);

    // Get remaining users
    const remainingUsers = await pool.request().query('SELECT id, name, email, role FROM Users');

    await pool.close();

    res.json({
      message: 'User cleanup completed',
      deletedCount: deleteResult.rowsAffected[0],
      remainingUsers: remainingUsers.recordset
    });

  } catch (error) {
    console.error('Error cleaning up users:', error);
    res.status(500).json({
      error: 'Failed to cleanup users',
      details: error.message
    });
  }
});

module.exports = router;