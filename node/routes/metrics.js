const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../db');
const authMiddleware = require('../middleware/auth');

// Get productivity metrics for user
router.get('/productivity/:userId', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const today = new Date().toISOString().split('T')[0];

        const result = await pool.request()
            .input('userId', sql.Int, req.params.userId)
            .input('date', sql.Date, today)
            .query(`
                SELECT * FROM ProductivityMetrics
                WHERE user_id = @userId AND metric_date = @date
            `);

        if (result.recordset.length > 0) {
            const metrics = result.recordset[0];
            res.json({
                date: metrics.metric_date,
                tasksCompleted: metrics.tasks_completed,
                hoursWorked: metrics.hours_worked,
                efficiencyScore: metrics.efficiency_score,
                qualityScore: metrics.quality_score,
                collaborationScore: metrics.collaboration_score,
                dailyGoals: JSON.parse(metrics.daily_goals || '{}'),
                achievements: JSON.parse(metrics.achievements || '[]')
            });
        } else {
            res.json({
                date: today,
                tasksCompleted: 0,
                hoursWorked: 0,
                efficiencyScore: 0,
                qualityScore: 0,
                collaborationScore: 0,
                dailyGoals: {},
                achievements: []
            });
        }
    } catch (error) {
        console.error('Error fetching productivity metrics:', error);
        res.status(500).json({ error: 'Failed to fetch productivity metrics' });
    }
});

// Save productivity metrics
router.post('/productivity', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const {
            date,
            tasksCompleted,
            hoursWorked,
            efficiencyScore,
            qualityScore,
            collaborationScore,
            dailyGoals,
            achievements
        } = req.body;

        await pool.request()
            .input('UserId', sql.Int, req.user.id)
            .input('MetricDate', sql.Date, date || new Date())
            .input('TasksCompleted', sql.Int, tasksCompleted)
            .input('HoursWorked', sql.Decimal(5, 2), hoursWorked)
            .input('EfficiencyScore', sql.Decimal(5, 2), efficiencyScore)
            .input('QualityScore', sql.Decimal(5, 2), qualityScore)
            .input('CollaborationScore', sql.Decimal(5, 2), collaborationScore)
            .input('DailyGoals', sql.NVarChar(sql.MAX), JSON.stringify(dailyGoals || {}))
            .input('Achievements', sql.NVarChar(sql.MAX), JSON.stringify(achievements || []))
            .execute('sp_SaveProductivityMetrics');

        res.json({ success: true, message: 'Productivity metrics saved' });
    } catch (error) {
        console.error('Error saving productivity metrics:', error);
        res.status(500).json({ error: 'Failed to save productivity metrics' });
    }
});

// Get metrics history
router.get('/productivity/history/:userId', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const { days = 30 } = req.query;

        const result = await pool.request()
            .input('userId', sql.Int, req.params.userId)
            .input('days', sql.Int, days)
            .query(`
                SELECT * FROM ProductivityMetrics
                WHERE user_id = @userId
                AND metric_date >= DATEADD(day, -@days, GETDATE())
                ORDER BY metric_date DESC
            `);

        const metrics = result.recordset.map(m => ({
            date: m.metric_date,
            tasksCompleted: m.tasks_completed,
            hoursWorked: m.hours_worked,
            efficiencyScore: m.efficiency_score,
            qualityScore: m.quality_score,
            collaborationScore: m.collaboration_score
        }));

        res.json(metrics);
    } catch (error) {
        console.error('Error fetching metrics history:', error);
        res.status(500).json({ error: 'Failed to fetch metrics history' });
    }
});

// Get dashboard view
router.get('/dashboard/:userId', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('userId', sql.Int, req.params.userId)
            .query(`
                SELECT * FROM vw_UserProductivityDashboard
                WHERE user_id = @userId
                ORDER BY metric_date DESC
            `);

        res.json(result.recordset);
    } catch (error) {
        console.error('Error fetching dashboard:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// Career progress endpoints
router.get('/career/:userId', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('userId', sql.Int, req.params.userId)
            .query(`
                SELECT * FROM CareerProgress
                WHERE user_id = @userId
                ORDER BY skill_category, skill_name
            `);

        const skills = {};
        result.recordset.forEach(skill => {
            if (!skills[skill.skill_category]) {
                skills[skill.skill_category] = {};
            }
            skills[skill.skill_category][skill.skill_name] = {
                currentLevel: skill.current_level,
                targetLevel: skill.target_level,
                progressPercentage: skill.progress_percentage,
                certifications: JSON.parse(skill.certifications || '[]'),
                milestones: JSON.parse(skill.milestones || '[]'),
                nextSteps: JSON.parse(skill.next_steps || '[]')
            };
        });

        res.json(skills);
    } catch (error) {
        console.error('Error fetching career progress:', error);
        res.status(500).json({ error: 'Failed to fetch career progress' });
    }
});

// Update skill progress
router.post('/career/skill', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const { skillName, skillCategory, currentLevel, certifications, milestones, nextSteps } = req.body;

        // Check if skill exists
        const existing = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .input('skillName', sql.NVarChar(100), skillName)
            .query('SELECT id FROM CareerProgress WHERE user_id = @userId AND skill_name = @skillName');

        if (existing.recordset.length > 0) {
            // Update existing
            await pool.request()
                .input('userId', sql.Int, req.user.id)
                .input('skillName', sql.NVarChar(100), skillName)
                .input('currentLevel', sql.Int, currentLevel)
                .input('certifications', sql.NVarChar(sql.MAX), JSON.stringify(certifications || []))
                .input('milestones', sql.NVarChar(sql.MAX), JSON.stringify(milestones || []))
                .input('nextSteps', sql.NVarChar(sql.MAX), JSON.stringify(nextSteps || []))
                .query(`
                    UPDATE CareerProgress
                    SET current_level = @currentLevel,
                        certifications = @certifications,
                        milestones = @milestones,
                        next_steps = @nextSteps,
                        last_assessment_date = GETDATE(),
                        updated_at = GETDATE()
                    WHERE user_id = @userId AND skill_name = @skillName
                `);
        } else {
            // Insert new
            await pool.request()
                .input('userId', sql.Int, req.user.id)
                .input('skillName', sql.NVarChar(100), skillName)
                .input('skillCategory', sql.NVarChar(50), skillCategory)
                .input('currentLevel', sql.Int, currentLevel)
                .input('certifications', sql.NVarChar(sql.MAX), JSON.stringify(certifications || []))
                .input('milestones', sql.NVarChar(sql.MAX), JSON.stringify(milestones || []))
                .input('nextSteps', sql.NVarChar(sql.MAX), JSON.stringify(nextSteps || []))
                .query(`
                    INSERT INTO CareerProgress (
                        user_id, skill_name, skill_category, current_level,
                        certifications, milestones, next_steps, last_assessment_date
                    ) VALUES (
                        @userId, @skillName, @skillCategory, @currentLevel,
                        @certifications, @milestones, @nextSteps, GETDATE()
                    )
                `);
        }

        res.json({ success: true, message: 'Skill progress updated' });
    } catch (error) {
        console.error('Error updating skill progress:', error);
        res.status(500).json({ error: 'Failed to update skill progress' });
    }
});

module.exports = router;