const express = require("express");
const cors = require("cors");
const path = require("path");
require('dotenv').config();
const app = express();
const cron = require("node-cron");
const db = require("./config/db");

// Cron job - Weekly announcement
cron.schedule("0 0 * * 1", async () => {
    try {
        // Use database date functions that work across databases
        const [result] = await db.query(`
            INSERT INTO announcements (title, message, pickup_date, created_by)
            SELECT 'Weekly Pickup',
                   'Garbage pickup scheduled this week',
                   CURDATE(),
                   id
            FROM users WHERE role = 'admin' LIMIT 1
        `);
        console.log('✅ Weekly announcement created successfully');
    } catch (error) {
        console.error('❌ Cron job error:', error);
    }
});

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Log requests (useful for debugging)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.path}`);
        next();
    });
}
// TEMPORARY: Add this after app.use(express.json()) and before routes
// REMOVE AFTER RUNNING!
app.get('/migrate', async (req, res) => {
    try {
        const secret = req.query.secret;
        if (secret !== 'your_migration_secret_123') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        console.log('🔧 Running database migration...');

        // Check if waypoints_json column exists
        const [columns] = await db.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'routes'
        `);

        const colNames = columns.map(c => c.COLUMN_NAME);
        const migrations = [];

        // Add waypoints_json if missing
        if (!colNames.includes('waypoints_json')) {
            try {
                await db.query(`ALTER TABLE routes ADD COLUMN waypoints_json JSON NULL`);
                migrations.push('✅ Added waypoints_json column');
            } catch (err) {
                // Fallback to TEXT for MySQL 5.7
                await db.query(`ALTER TABLE routes ADD COLUMN waypoints_json TEXT NULL`);
                migrations.push('✅ Added waypoints_json as TEXT');
            }
        } else {
            migrations.push('ℹ️ waypoints_json already exists');
        }

        // Add path_mode if missing
        if (!colNames.includes('path_mode')) {
            await db.query(`ALTER TABLE routes ADD COLUMN path_mode VARCHAR(20) DEFAULT 'pin'`);
            migrations.push('✅ Added path_mode column');
        } else {
            migrations.push('ℹ️ path_mode already exists');
        }

        // Update existing rows with default values
        await db.query(`
            UPDATE routes 
            SET waypoints_json = '{"road":[],"pins":[],"mrf":[]}' 
            WHERE waypoints_json IS NULL
        `);
        migrations.push('✅ Updated existing rows with default values');

        res.json({
            success: true,
            message: 'Migration completed successfully',
            migrations: migrations,
            table_columns: colNames
        });

    } catch (error) {
        console.error('❌ Migration error:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/resident", require("./routes/residentRoutes"));
app.use("/driver/api", require("./routes/driverRoutes"));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

// Handle 404 - Keep this after all routes
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Access: http://localhost:${PORT}/login.html`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});