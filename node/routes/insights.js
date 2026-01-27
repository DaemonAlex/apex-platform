const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../db');
const authMiddleware = require('../middleware/auth');

// Get personal insights
router.get('/personal/:userId', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('userId', sql.Int, req.params.userId)
            .query(`
                SELECT * FROM PersonalInsights
                WHERE user_id = @userId AND is_archived = 0
                ORDER BY priority DESC, created_at DESC
            `);

        const insights = result.recordset.map(insight => ({
            id: insight.id,
            type: insight.insight_type,
            category: insight.category,
            title: insight.title,
            content: insight.content,
            metrics: JSON.parse(insight.metrics || '{}'),
            recommendations: JSON.parse(insight.recommendations || '[]'),
            priority: insight.priority,
            createdAt: insight.created_at
        }));

        res.json(insights);
    } catch (error) {
        console.error('Error fetching personal insights:', error);
        res.status(500).json({ error: 'Failed to fetch personal insights' });
    }
});

// Save personal insight
router.post('/personal', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const {
            insightType,
            category,
            title,
            content,
            metrics,
            recommendations,
            priority
        } = req.body;

        const result = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .input('insightType', sql.NVarChar(50), insightType)
            .input('category', sql.NVarChar(50), category)
            .input('title', sql.NVarChar(200), title)
            .input('content', sql.NVarChar(sql.MAX), content)
            .input('metrics', sql.NVarChar(sql.MAX), JSON.stringify(metrics || {}))
            .input('recommendations', sql.NVarChar(sql.MAX), JSON.stringify(recommendations || []))
            .input('priority', sql.Int, priority || 5)
            .query(`
                INSERT INTO PersonalInsights (
                    user_id, insight_type, category, title, content,
                    metrics, recommendations, priority
                ) OUTPUT INSERTED.id
                VALUES (
                    @userId, @insightType, @category, @title, @content,
                    @metrics, @recommendations, @priority
                )
            `);

        res.json({
            success: true,
            insightId: result.recordset[0].id,
            message: 'Personal insight saved'
        });
    } catch (error) {
        console.error('Error saving personal insight:', error);
        res.status(500).json({ error: 'Failed to save personal insight' });
    }
});

// Get weekly goals
router.get('/goals/weekly/:userId', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const today = new Date();
        const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const result = await pool.request()
            .input('userId', sql.Int, req.params.userId)
            .input('weekStart', sql.Date, weekStart)
            .query(`
                SELECT * FROM WeeklyGoals
                WHERE user_id = @userId AND week_start_date = @weekStart
            `);

        if (result.recordset.length > 0) {
            const goals = result.recordset[0];
            res.json({
                goals: JSON.parse(goals.goals || '[]'),
                completedGoals: JSON.parse(goals.completed_goals || '[]'),
                progressPercentage: goals.progress_percentage,
                reflectionNotes: goals.reflection_notes
            });
        } else {
            res.json({
                goals: [],
                completedGoals: [],
                progressPercentage: 0,
                reflectionNotes: ''
            });
        }
    } catch (error) {
        console.error('Error fetching weekly goals:', error);
        res.status(500).json({ error: 'Failed to fetch weekly goals' });
    }
});

// Save weekly goals
router.post('/goals/weekly', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const { goals, completedGoals, reflectionNotes } = req.body;

        const today = new Date();
        const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const progressPercentage = goals.length > 0
            ? (completedGoals.length / goals.length * 100).toFixed(2)
            : 0;

        // Check if exists
        const existing = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .input('weekStart', sql.Date, weekStart)
            .query('SELECT id FROM WeeklyGoals WHERE user_id = @userId AND week_start_date = @weekStart');

        if (existing.recordset.length > 0) {
            // Update
            await pool.request()
                .input('userId', sql.Int, req.user.id)
                .input('weekStart', sql.Date, weekStart)
                .input('goals', sql.NVarChar(sql.MAX), JSON.stringify(goals))
                .input('completedGoals', sql.NVarChar(sql.MAX), JSON.stringify(completedGoals))
                .input('progressPercentage', sql.Decimal(5, 2), progressPercentage)
                .input('reflectionNotes', sql.NVarChar(sql.MAX), reflectionNotes)
                .query(`
                    UPDATE WeeklyGoals
                    SET goals = @goals,
                        completed_goals = @completedGoals,
                        progress_percentage = @progressPercentage,
                        reflection_notes = @reflectionNotes,
                        updated_at = GETDATE()
                    WHERE user_id = @userId AND week_start_date = @weekStart
                `);
        } else {
            // Insert
            await pool.request()
                .input('userId', sql.Int, req.user.id)
                .input('weekStart', sql.Date, weekStart)
                .input('weekEnd', sql.Date, weekEnd)
                .input('goals', sql.NVarChar(sql.MAX), JSON.stringify(goals))
                .input('completedGoals', sql.NVarChar(sql.MAX), JSON.stringify(completedGoals))
                .input('progressPercentage', sql.Decimal(5, 2), progressPercentage)
                .input('reflectionNotes', sql.NVarChar(sql.MAX), reflectionNotes)
                .query(`
                    INSERT INTO WeeklyGoals (
                        user_id, week_start_date, week_end_date, goals,
                        completed_goals, progress_percentage, reflection_notes
                    ) VALUES (
                        @userId, @weekStart, @weekEnd, @goals,
                        @completedGoals, @progressPercentage, @reflectionNotes
                    )
                `);
        }

        res.json({ success: true, message: 'Weekly goals saved' });
    } catch (error) {
        console.error('Error saving weekly goals:', error);
        res.status(500).json({ error: 'Failed to save weekly goals' });
    }
});

// Get early warning alerts
router.get('/alerts/:userId', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('userId', sql.Int, req.params.userId)
            .query(`
                SELECT * FROM vw_ActiveAlerts
                WHERE user_id = @userId
            `);

        res.json(result.recordset);
    } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

// Create early warning alert
router.post('/alerts', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const {
            alertType,
            severity,
            projectId,
            taskId,
            title,
            description,
            thresholdValue,
            actualValue
        } = req.body;

        const result = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .input('alertType', sql.NVarChar(50), alertType)
            .input('severity', sql.NVarChar(20), severity)
            .input('projectId', sql.Int, projectId || null)
            .input('taskId', sql.Int, taskId || null)
            .input('title', sql.NVarChar(200), title)
            .input('description', sql.NVarChar(sql.MAX), description)
            .input('thresholdValue', sql.Decimal(10, 2), thresholdValue || null)
            .input('actualValue', sql.Decimal(10, 2), actualValue || null)
            .query(`
                INSERT INTO EarlyWarningAlerts (
                    user_id, alert_type, severity, project_id, task_id,
                    title, description, threshold_value, actual_value
                ) OUTPUT INSERTED.id
                VALUES (
                    @userId, @alertType, @severity, @projectId, @taskId,
                    @title, @description, @thresholdValue, @actualValue
                )
            `);

        res.json({
            success: true,
            alertId: result.recordset[0].id,
            message: 'Alert created'
        });
    } catch (error) {
        console.error('Error creating alert:', error);
        res.status(500).json({ error: 'Failed to create alert' });
    }
});

// Acknowledge alert
router.put('/alerts/:alertId/acknowledge', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const { resolutionNotes } = req.body;

        await pool.request()
            .input('alertId', sql.Int, req.params.alertId)
            .input('userId', sql.Int, req.user.id)
            .input('resolutionNotes', sql.NVarChar(sql.MAX), resolutionNotes)
            .query(`
                UPDATE EarlyWarningAlerts
                SET is_acknowledged = 1,
                    acknowledged_by = @userId,
                    acknowledged_at = GETDATE(),
                    resolution_notes = @resolutionNotes,
                    updated_at = GETDATE()
                WHERE id = @alertId
            `);

        res.json({ success: true, message: 'Alert acknowledged' });
    } catch (error) {
        console.error('Error acknowledging alert:', error);
        res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
});

// Enhanced audit log
router.post('/audit', authMiddleware, async (req, res) => {
    try {
        const pool = await poolPromise;
        const {
            action,
            entityType,
            entityId,
            entityName,
            beforeValue,
            afterValue,
            details,
            severity,
            metaData
        } = req.body;

        const result = await pool.request()
            .input('UserId', sql.Int, req.user.id)
            .input('Username', sql.NVarChar(100), req.user.username)
            .input('Action', sql.NVarChar(100), action)
            .input('EntityType', sql.NVarChar(50), entityType)
            .input('EntityId', sql.Int, entityId || null)
            .input('EntityName', sql.NVarChar(200), entityName)
            .input('BeforeValue', sql.NVarChar(sql.MAX), JSON.stringify(beforeValue || null))
            .input('AfterValue', sql.NVarChar(sql.MAX), JSON.stringify(afterValue || null))
            .input('Details', sql.NVarChar(sql.MAX), details)
            .input('Severity', sql.NVarChar(20), severity || 'info')
            .input('IpAddress', sql.NVarChar(45), req.ip)
            .input('UserAgent', sql.NVarChar(500), req.headers['user-agent'])
            .input('SessionId', sql.NVarChar(100), req.session?.id)
            .input('PageUrl', sql.NVarChar(500), req.headers.referer)
            .input('MetaData', sql.NVarChar(sql.MAX), JSON.stringify(metaData || {}))
            .execute('sp_AddAuditLogEntry');

        res.json({
            success: true,
            auditLogId: result.recordset[0].AuditLogId
        });
    } catch (error) {
        console.error('Error adding audit log:', error);
        res.status(500).json({ error: 'Failed to add audit log entry' });
    }
});

module.exports = router;