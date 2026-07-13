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
        await db.query(`
            INSERT INTO announcements (title, message, pickup_date, created_by)
            SELECT 'Weekly Pickup',
                   'Garbage pickup scheduled this week',
                   CURDATE(),
                   id
            FROM users WHERE role = 'admin' LIMIT 1
        `);
        console.log('Weekly announcement created successfully');
    } catch (error) {
        console.error('Cron job error:', error);
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/resident", require("./routes/residentRoutes"));
app.use("/driver/api", require("./routes/driverRoutes"));

// Health check endpoint (for Tinkerhost monitoring)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date(),
        uptime: process.uptime()
    });
});

// Handle 404 - Keep this after all routes
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Access: http://localhost:${PORT}/login.html`);
});