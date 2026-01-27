const express = require('express');
const router = express.Router();

// Mock settings - APEX expects these endpoints
router.get('/', async (req, res) => {
  try {
    const settings = {
      companyName: 'APEX Demo Company',
      defaultBudget: 100000,
      currency: 'USD'
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings', details: error.message });
  }
});

// Update settings
router.post('/', async (req, res) => {
  try {
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
});

// Get productivity goals
router.get('/productivity-goals', async (req, res) => {
  try {
    const goals = {
      weekly: {
        projectsCompleted: 2,
        tasksCompleted: 15,
        hoursWorked: 40
      },
      monthly: {
        projectsCompleted: 8,
        tasksCompleted: 60,
        hoursWorked: 160
      }
    };

    res.json(goals);
  } catch (error) {
    console.error('Get productivity goals error:', error);
    res.status(500).json({ error: 'Failed to fetch productivity goals', details: error.message });
  }
});

// Update productivity goals
router.post('/productivity-goals', async (req, res) => {
  try {
    const goals = req.body;

    // Here you would save to database
    res.json({
      message: 'Productivity goals updated successfully',
      goals: goals
    });
  } catch (error) {
    console.error('Update productivity goals error:', error);
    res.status(500).json({ error: 'Failed to update productivity goals', details: error.message });
  }
});

// Delete setting
router.delete('/:key', async (req, res) => {
  try {
    const key = req.params.key;

    res.json({ message: `Setting '${key}' deleted successfully` });
  } catch (error) {
    console.error('Delete setting error:', error);
    res.status(500).json({ error: 'Failed to delete setting', details: error.message });
  }
});

module.exports = router;