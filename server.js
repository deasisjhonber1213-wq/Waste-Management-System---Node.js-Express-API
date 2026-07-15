const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

const db = require("./config/db");
const bcrypt = require("bcrypt");

const connectedDrivers = new Map();


io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('driver-auth', async (data) => {
        try {
            const { driverId, token } = data;
            const jwt = require('jsonwebtoken');
            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            } catch (e) {
                socket.emit('auth-error', { message: 'Invalid token' });
                return;
            }

            const [user] = await db.query(
                'SELECT id, name, email, role FROM users WHERE id = ? AND role = "driver"',
                [driverId]
            );

            if (!user.length) {
                socket.emit('auth-error', { message: 'Invalid driver' });
                return;
            }

            socket.driverId = driverId;
            socket.driverName = user[0].name;
            socket.join(`driver-${driverId}`);

            connectedDrivers.set(driverId, {
                socketId: socket.id,
                name: user[0].name,
                connectedAt: new Date()
            });

            console.log(`✅ Driver ${driverId} (${user[0].name}) authenticated`);

            const [assignment] = await db.query(
                `SELECT 
                    ra.id, ra.assigned_date, ra.status, ra.pickup_type,
                    r.id as route_id, r.zone_name, r.description as zone_description,
                    t.id as truck_id, t.plate_number, t.model
                FROM route_assignments ra
                JOIN routes r ON ra.route_id = r.id
                JOIN trucks t ON ra.truck_id = t.id
                WHERE ra.driver_id = ? AND ra.assigned_date = CURDATE()
                LIMIT 1`,
                [driverId]
            );

            if (assignment.length) {
                socket.emit('assignment-update', assignment[0]);

                const [route] = await db.query(
                    'SELECT waypoints_json FROM routes WHERE id = ?',
                    [assignment[0].route_id]
                );

                if (route.length && route[0].waypoints_json) {
                    socket.emit('route-waypoints', {
                        route_id: assignment[0].route_id,
                        waypoints: route[0].waypoints_json
                    });
                }
            }

            const [stats] = await db.query(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
                FROM route_assignments
                WHERE driver_id = ?`,
                [driverId]
            );
            socket.emit('stats-update', stats[0]);

            socket.emit('auth-success', {
                message: 'Authenticated successfully',
                driver: user[0]
            });

        } catch (error) {
            console.error('Auth error:', error);
            socket.emit('auth-error', { message: 'Authentication failed' });
        }
    });

    socket.on('driver-location', async (data) => {
        try {
            const { latitude, longitude, accuracy, timestamp } = data;
            const driverId = socket.driverId;

            if (!driverId) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            const [assignment] = await db.query(
                `SELECT truck_id FROM route_assignments 
                 WHERE driver_id = ? AND assigned_date = CURDATE() 
                 LIMIT 1`,
                [driverId]
            );

            if (assignment.length) {
                await db.query(
                    'UPDATE trucks SET latitude = ?, longitude = ?, last_location_update = NOW() WHERE id = ?',
                    [latitude, longitude, assignment[0].truck_id]
                );

                await db.query(
                    `INSERT INTO trip_logs (assignment_id, latitude, longitude, logged_at)
                     SELECT ra.id, ?, ?, NOW()
                     FROM route_assignments ra
                     WHERE ra.driver_id = ? AND ra.assigned_date = CURDATE()
                     LIMIT 1`,
                    [latitude, longitude, driverId]
                );
            }

            socket.broadcast.to(`dispatcher-${driverId}`).emit('driver-moved', {
                driverId,
                latitude,
                longitude,
                accuracy,
                timestamp: timestamp || Date.now()
            });

            connectedDrivers.set(driverId, {
                ...connectedDrivers.get(driverId),
                lastLat: latitude,
                lastLng: longitude,
                lastUpdate: new Date()
            });

        } catch (error) {
            console.error('Location update error:', error);
            socket.emit('error', { message: 'Failed to update location' });
        }
    });

    socket.on('update-status', async (data) => {
        try {
            const { assignmentId, status } = data;
            const driverId = socket.driverId;

            if (!driverId) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            await db.query(
                'UPDATE route_assignments SET status = ? WHERE id = ? AND driver_id = ?',
                [status, assignmentId, driverId]
            );

            if (status === 'completed') {
                await db.query(
                    `INSERT INTO trip_logs (assignment_id, completed_at, status)
                     VALUES (?, NOW(), 'completed')
                     ON DUPLICATE KEY UPDATE completed_at = NOW(), status = 'completed'`,
                    [assignmentId]
                );
            }

            io.to(`driver-${driverId}`).emit('assignment-status-changed', {
                assignmentId,
                status,
                timestamp: new Date()
            });

            socket.broadcast.to(`dispatcher-${driverId}`).emit('driver-status-changed', {
                driverId,
                status,
                assignmentId
            });

            socket.emit('status-updated', {
                success: true,
                message: `Status updated to ${status}`
            });

        } catch (error) {
            console.error('Status update error:', error);
            socket.emit('error', { message: 'Failed to update status' });
        }
    });

    socket.on('submit-report', async (data) => {
        try {
            const { type, description, location_note } = data;
            const driverId = socket.driverId;

            if (!driverId) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            await db.query(
                `INSERT INTO reports (resident_id, type, description, location_note, created_at)
                 VALUES (?, ?, ?, ?, NOW())`,
                [driverId, type, description, location_note || null]
            );

            socket.emit('report-submitted', {
                success: true,
                message: 'Report submitted successfully'
            });

        } catch (error) {
            console.error('Report submission error:', error);
            socket.emit('error', { message: 'Failed to submit report' });
        }
    });

    socket.on('update-profile', async (data) => {
        try {
            const { name, phone, address } = data;
            const driverId = socket.driverId;

            if (!driverId) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            await db.query(
                'UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?',
                [name, phone, address, driverId]
            );

            socket.emit('profile-updated', {
                success: true,
                message: 'Profile updated successfully'
            });

        } catch (error) {
            console.error('Profile update error:', error);
            socket.emit('error', { message: 'Failed to update profile' });
        }
    });

    socket.on('admin-announcement', (data) => {
        io.emit('new-announcement', data);
    });

    socket.on('disconnect', () => {
        if (socket.driverId) {
            connectedDrivers.delete(socket.driverId);
            console.log(`👋 Driver ${socket.driverId} disconnected`);
            socket.broadcast.to(`dispatcher-${socket.driverId}`).emit('driver-disconnected', {
                driverId: socket.driverId,
                timestamp: new Date()
            });
        }
        console.log('🔌 Client disconnected:', socket.id);
    });
});


const cron = require("node-cron");
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
        console.log('✅ Weekly announcement created successfully');
    } catch (error) {
        console.error('❌ Cron job error:', error);
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.path
    });
});

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/driver/api/')) {
        return next();
    }
    if (req.path === '/health' || req.path === '/migrate' || req.path === '/setup-admin') {
        return next();
    }

    if (path.extname(req.path) === '') {
        const cleanPath = req.path.replace(/\/$/, '');
        const htmlPath = path.join(__dirname, 'public', cleanPath + '.html');
        if (fs.existsSync(htmlPath)) {
            return res.sendFile(htmlPath);
        }
        if (req.path === '/' || req.path === '') {
            const indexPath = path.join(__dirname, 'public', 'index.html');
            if (fs.existsSync(indexPath)) {
                return res.sendFile(indexPath);
            }
        }
    }
    next();
});


app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        const cleanPath = req.path.replace(/\.html$/, '');
        return res.redirect(301, cleanPath);
    }
    next();
});


if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.path}`);
        next();
    });
}


app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/resident", require("./routes/residentRoutes"));
app.use("/driver/api", require("./routes/driverRoutes"));


app.get('/migrate', async (req, res) => {
    try {
        const secret = req.query.secret;
        if (secret !== 'your_migration_secret_123') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        console.log('🔧 Running database migration...');
        const migrations = [];

        const [columns] = await db.query(`
            SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'routes'
        `);

        const colNames = columns.map(c => c.COLUMN_NAME);
        const pathModeCol = columns.find(c => c.COLUMN_NAME === 'path_mode');

        if (!colNames.includes('waypoints_json')) {
            try {
                await db.query(`ALTER TABLE routes ADD COLUMN waypoints_json JSON NULL`);
                migrations.push('✅ Added waypoints_json column');
            } catch (err) {
                await db.query(`ALTER TABLE routes ADD COLUMN waypoints_json TEXT NULL`);
                migrations.push('✅ Added waypoints_json as TEXT');
            }
        } else {
            migrations.push('ℹ️ waypoints_json already exists');
        }

        if (pathModeCol && pathModeCol.DATA_TYPE === 'json') {
            await db.query(`ALTER TABLE routes MODIFY COLUMN path_mode VARCHAR(50) DEFAULT 'pin'`);
            migrations.push('✅ Changed path_mode from JSON to VARCHAR');
        } else if (!colNames.includes('path_mode')) {
            await db.query(`ALTER TABLE routes ADD COLUMN path_mode VARCHAR(50) DEFAULT 'pin'`);
            migrations.push('✅ Added path_mode column');
        } else {
            migrations.push('ℹ️ path_mode already exists and has correct type');
        }

        await db.query(`
            UPDATE routes 
            SET waypoints_json = '{"road":[],"pins":[],"mrf":[]}' 
            WHERE waypoints_json IS NULL
        `);
        migrations.push('✅ Updated existing rows with default values');

        const [finalColumns] = await db.query(`
            SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'routes'
        `);

        res.json({
            success: true,
            message: 'Migration completed successfully',
            migrations: migrations,
            table_columns: finalColumns
        });

    } catch (error) {
        console.error('❌ Migration error:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});


app.get('/setup-admin', async (req, res) => {
    try {
        const secret = req.query.secret;
        if (secret !== 'setup123') {
            return res.status(401).json({ error: 'Unauthorized. Use ?secret=setup123' });
        }

        const email = 'admin@smartwaste.com';
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);

        const [existing] = await db.query('SELECT id, email FROM users WHERE email = ?', [email]);

        let message = '';
        if (existing.length > 0) {
            await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
            message = '✅ Admin password reset successfully!';
        } else {
            await db.query(
                'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                ['Admin', email, hashedPassword, 'admin']
            );
            message = '✅ Admin created successfully!';
        }

        console.log('✅ Admin setup completed:', email);

        res.json({
            success: true,
            message: message,
            email: email,
            password: password,
            login_url: `${req.protocol}://${req.get('host')}/login`,
            warning: '⚠️ For security, remove this endpoint after use or add authentication'
        });

    } catch (error) {
        console.error('❌ Admin setup error:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});


app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        connectedDrivers: connectedDrivers.size
    });
});


app.get('/api/drivers/online', (req, res) => {
    const online = Array.from(connectedDrivers.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        lastLat: data.lastLat,
        lastLng: data.lastLng,
        connectedAt: data.connectedAt,
        lastUpdate: data.lastUpdate
    }));
    res.json(online);
});


app.use((req, res) => {
    const notFoundPath = path.join(__dirname, 'public', '404.html');
    if (fs.existsSync(notFoundPath)) {
        return res.status(404).sendFile(notFoundPath);
    }
    res.status(404).json({
        error: 'Page not found',
        path: req.path
    });
});


app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Access: http://localhost:${PORT}/login`);
    console.log(`📱 Resident: http://localhost:${PORT}/resident`);
    console.log(`📱 Driver: http://localhost:${PORT}/driver`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
});