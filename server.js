const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const crypto = require("crypto");
require('dotenv').config();

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes before starting the server.');
}

const app = express();
const server = http.createServer(app);

app.use(compression());

function manilaToday() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", "'unsafe-inline'", "'unsafe-eval'",
                "https://unpkg.com", "https://cdn.socket.io", "https://cdn.jsdelivr.net"
            ],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: [
                "'self'", "data:", "blob:",
                "https://images.unsplash.com", "https://unpkg.com",
                "https://*.basemaps.cartocdn.com", "https://server.arcgisonline.com"
            ],
            connectSrc: [
                "'self'", process.env.CORS_ORIGIN || "*",
                "https://*.basemaps.cartocdn.com", "https://server.arcgisonline.com",
                "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdn.socket.io",
                "wss:", "ws:"
            ],
        },
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: "same-origin" },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

const corsOptions = {
    origin: process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : ['http://localhost:5000', 'https://smartwaste.railway.app'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    maxAge: 86400
};
app.use(cors(corsOptions));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many requests, please try again later.'
        });
    }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many login attempts, please try again later.'
        });
    }
});
app.use('/api/auth/login', authLimiter);

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
        domain: process.env.COOKIE_DOMAIN || undefined
    },
    name: 'swm.sid'
}));

app.use((req, res, next) => {
    req.requestId = crypto.randomBytes(16).toString('hex');
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.set('trust proxy', 1);

const xss = require('xss');
app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (data) {
        if (typeof data === 'object' && data !== null) {
            const sanitize = (obj) => {
                for (let key in obj) {
                    if (typeof obj[key] === 'string') {
                        obj[key] = xss(obj[key]);
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        sanitize(obj[key]);
                    }
                }
                return obj;
            };
            data = sanitize(data);
        }
        return originalJson.call(this, data);
    };
    next();
});

const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5000',
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket'],
    pingTimeout: 60000,
    pingInterval: 25000,
    allowEIO3: true,
    cookie: {
        name: 'swm.io',
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production'
    }
});

io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
        return next(new Error('Authentication required'));
    }

    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        next();
    } catch (err) {
        next(new Error('Invalid token'));
    }
});

const db = require("./config/db");
const jwt = require("jsonwebtoken");
const auth = require("./middleware/auth");
const connectedDrivers = new Map();
app.set('connectedDrivers', connectedDrivers);

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('driver-auth', async (data) => {
        try {
            const { driverId, token } = data;

            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded.id !== parseInt(driverId)) {
                    socket.emit('auth-error', { message: 'Token mismatch' });
                    return;
                }
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
            socket.join(`dispatcher-${driverId}`);

            connectedDrivers.set(driverId, {
                socketId: socket.id,
                name: user[0].name,
                connectedAt: new Date(),
                userId: socket.userId
            });

            console.log(`✅ Driver ${driverId} (${user[0].name}) authenticated`);

            // Multi-assignment fetch — no LIMIT 1
            const [assignments] = await db.query(
                `SELECT 
                ra.id, ra.assigned_date, ra.status, ra.pickup_type,
                r.id as route_id, r.zone_name, r.description as zone_description,
                t.id as truck_id, t.plate_number, t.model
            FROM route_assignments ra
            JOIN routes r ON ra.route_id = r.id
            JOIN trucks t ON ra.truck_id = t.id
            WHERE ra.driver_id = ? AND ra.assigned_date = CURDATE()
            ORDER BY ra.id ASC`,
                [driverId]
            );

            // Always emit an array — client's assignment-update handler expects it
            socket.emit('assignment-update', assignments);

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
            const { latitude, longitude, accuracy, timestamp, assignmentId } = data;
            const driverId = socket.driverId;

            if (!driverId) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            let assignment;
            if (assignmentId) {
                const [rows] = await db.query(
                    `SELECT id, truck_id FROM route_assignments
                 WHERE id = ? AND driver_id = ? AND assigned_date = CURDATE()`,
                    [assignmentId, driverId]
                );
                assignment = rows[0];
            }

            if (!assignment) {
                // No/invalid assignmentId supplied — fall back to the most
                // relevant assignment: in-progress first, else earliest pending.
                const [rows] = await db.query(
                    `SELECT id, truck_id FROM route_assignments
                 WHERE driver_id = ? AND assigned_date = CURDATE()
                 ORDER BY FIELD(status,'in_progress','pending','completed','cancelled'), id ASC
                 LIMIT 1`,
                    [driverId]
                );
                assignment = rows[0];
            }

            if (assignment) {
                await db.query(
                    'UPDATE trucks SET latitude = ?, longitude = ?, location_updated_at = NOW() WHERE id = ?',
                    [latitude, longitude, assignment.truck_id]
                );

                await db.query(
                    `INSERT INTO trip_logs (assignment_id, latitude, longitude, logged_at)
                 VALUES (?, ?, ?, NOW())`,
                    [assignment.id, latitude, longitude]
                );

                io.emit('truck-location', {
                    truckId: assignment.truck_id,
                    assignmentId: assignment.id,
                    latitude, longitude, accuracy,
                    timestamp: timestamp || Date.now()
                });
            }

            socket.broadcast.to(`dispatcher-${driverId}`).emit('driver-moved', {
                driverId,
                assignmentId: assignment ? assignment.id : null,
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
            io.emit('assignment-public-status', { assignmentId, status, driverId });

            // NEW: push the refreshed set of today's assignments so tabs update live
            const [assignments] = await db.query(
                `SELECT 
                ra.id, ra.assigned_date, ra.status, ra.pickup_type,
                r.id as route_id, r.zone_name, r.description as zone_description,
                t.id as truck_id, t.plate_number, t.model
            FROM route_assignments ra
            JOIN routes r ON ra.route_id = r.id
            JOIN trucks t ON ra.truck_id = t.id
            WHERE ra.driver_id = ? AND ra.assigned_date = CURDATE()
            ORDER BY ra.id ASC`,
                [driverId]
            );
            io.to(`driver-${driverId}`).emit('assignment-update', assignments);

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
                `INSERT INTO reports (resident_id, type, description, location_note, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', NOW())`,
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

// ---------- UPLOADS ----------
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
    maxAge: '7d',
    etag: true,
    lastModified: true
}));

const uploadDirs = [
    path.join(__dirname, 'public/uploads'),
    path.join(__dirname, 'public/uploads/announcements')
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
});

// ---------- CRON ----------
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

// ---------- STATIC FILES ----------
app.use(express.static(path.join(__dirname, "public"), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    index: false,
    setHeaders: (res, filePath) => {
        if (
            filePath === path.join(__dirname, 'public', 'service-worker.js') ||
            filePath === path.join(__dirname, 'public', 'manifest.webmanifest')
        ) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.use('/pages', express.static(path.join(__dirname, 'public/pages'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    index: false
}));

const recoveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: "Too many recovery attempts, try again later." }
});
app.use("/api/auth/forgot-password", recoveryLimiter);
app.use("/api/auth/reset-password", recoveryLimiter);
// ---------- PAGE ROUTES (public/pages/...) ----------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/pages', 'login.html'));
});

// Auth pages
const authPages = ['login', 'register', 'forgot-password'];
authPages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        const filePath = path.join(__dirname, 'public/pages', `${page}.html`);
        if (fs.existsSync(filePath)) return res.sendFile(filePath);
        res.status(404).json({ error: 'Page not found' });
    });

    app.get(`/pages/${page}`, (req, res) => {
        const filePath = path.join(__dirname, 'public/pages', `${page}.html`);
        if (fs.existsSync(filePath)) return res.sendFile(filePath);
        res.status(404).json({ error: 'Page not found' });
    });
});

// Admin pages
const adminPages = ['dashboard', 'users', 'trucks', 'routes', 'schedules', 'reports', 'announcements', 'analytics'];

adminPages.forEach(page => {
    // /admin/users
    app.get(`/admin/${page}`, (req, res) => {
        const filePath = path.join(__dirname, 'public/pages/admin', `${page}.html`);
        if (fs.existsSync(filePath)) return res.sendFile(filePath);
        res.status(404).json({ error: 'Page not found', path: req.path });
    });

    // /pages/admin/users
    app.get(`/pages/admin/${page}`, (req, res) => {
        const filePath = path.join(__dirname, 'public/pages/admin', `${page}.html`);
        if (fs.existsSync(filePath)) return res.sendFile(filePath);
        res.status(404).json({ error: 'Page not found', path: req.path });
    });

    // /users  (short version)
    app.get(`/${page}`, (req, res) => {
        const filePath = path.join(__dirname, 'public/pages/admin', `${page}.html`);
        if (fs.existsSync(filePath)) return res.sendFile(filePath);
        res.status(404).json({ error: 'Page not found', path: req.path });
    });

    // /pages/users
    app.get(`/pages/${page}`, (req, res) => {
        const filePath = path.join(__dirname, 'public/pages/admin', `${page}.html`);
        if (fs.existsSync(filePath)) return res.sendFile(filePath);
        res.status(404).json({ error: 'Page not found', path: req.path });
    });
});

app.get('/admin', (req, res) => res.redirect('/pages/admin/dashboard'));
app.get('/pages/admin', (req, res) => res.redirect('/pages/admin/dashboard'));

// Resident
app.get('/resident/dashboard', (req, res) => {
    const filePath = path.join(__dirname, 'public/pages/residents', 'resident-dashboard.html');
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
    res.status(404).json({ error: 'Page not found' });
});
app.get('/pages/resident/dashboard', (req, res) => {
    const filePath = path.join(__dirname, 'public/pages/residents', 'resident-dashboard.html');
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
    res.status(404).json({ error: 'Page not found' });
});

app.get('/resident', (req, res) => {
    const residentPath = path.join(__dirname, 'public/pages/residents', 'resident.html');
    const dashboardPath = path.join(__dirname, 'public/pages/residents', 'resident-dashboard.html');
    if (fs.existsSync(residentPath)) return res.sendFile(residentPath);
    if (fs.existsSync(dashboardPath)) return res.sendFile(dashboardPath);
    res.redirect('/login');
});
app.get('/pages/resident', (req, res) => {
    const residentPath = path.join(__dirname, 'public/pages/residents', 'resident.html');
    const dashboardPath = path.join(__dirname, 'public/pages/residents', 'resident-dashboard.html');
    if (fs.existsSync(residentPath)) return res.sendFile(residentPath);
    if (fs.existsSync(dashboardPath)) return res.sendFile(dashboardPath);
    res.redirect('/login');
});

// Driver
app.get('/driver/dashboard', (req, res) => {
    const filePath = path.join(__dirname, 'public/pages/driver', 'driver-dashboard.html');
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
    res.status(404).json({ error: 'Page not found' });
});
app.get('/pages/driver/dashboard', (req, res) => {
    const filePath = path.join(__dirname, 'public/pages/driver', 'driver-dashboard.html');
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
    res.status(404).json({ error: 'Page not found' });
});

app.get('/driver', (req, res) => {
    const filePath = path.join(__dirname, 'public/pages/driver', 'driver-dashboard.html');
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
    res.redirect('/login');
});
app.get('/pages/driver', (req, res) => {
    const filePath = path.join(__dirname, 'public/pages/driver', 'driver-dashboard.html');
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
    res.redirect('/login');
});

app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        const cleanPath = req.path.replace(/\.html$/, '');
        return res.redirect(301, cleanPath);
    }
    next();
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/resident", require("./routes/residentRoutes"));
app.use("/driver/api", require("./routes/driverRoutes"));

app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/driver/api/')) {
        return next();
    }
    if (req.path === '/health' || req.path === '/migrate') {
        return next();
    }

    if (path.extname(req.path) === '') {
        const cleanPath = req.path.replace(/\/$/, '');

        // try public/pages/...
        let htmlPath = path.join(__dirname, 'public/pages', cleanPath + '.html');
        if (fs.existsSync(htmlPath)) {
            return res.sendFile(htmlPath);
        }

        // try without leading /pages
        if (cleanPath.startsWith('/pages/')) {
            htmlPath = path.join(__dirname, 'public', cleanPath + '.html');
            if (fs.existsSync(htmlPath)) {
                return res.sendFile(htmlPath);
            }
        }

        if (req.path === '/' || req.path === '') {
            const indexPath = path.join(__dirname, 'public/pages', 'login.html');
            if (fs.existsSync(indexPath)) {
                return res.sendFile(indexPath);
            }
        }
    }
    next();
});

// ---------- UTILITY ROUTES ----------
app.post('/migrate', async (req, res) => {
    try {
        const expectedSecret = process.env.MIGRATION_SECRET;
        const suppliedSecret = req.get('X-Migration-Secret') || '';
        const suppliedBuffer = Buffer.from(suppliedSecret);
        const expectedBuffer = Buffer.from(expectedSecret || '');

            if (!expectedSecret || expectedSecret.length < 32 ||
                suppliedBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
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

        const [userColumns] = await db.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'users'
        `);
        const userColNames = userColumns.map(c => c.COLUMN_NAME);

        if (!userColNames.includes('last_login')) {
            await db.query(`ALTER TABLE users ADD COLUMN last_login DATETIME NULL`);
            migrations.push('✅ Added last_login column');
        }
        if (!userColNames.includes('last_ip')) {
            await db.query(`ALTER TABLE users ADD COLUMN last_ip VARCHAR(45) NULL`);
            migrations.push('✅ Added last_ip column');
        }
        if (!userColNames.includes('failed_attempts')) {
            await db.query(`ALTER TABLE users ADD COLUMN failed_attempts INT DEFAULT 0`);
            migrations.push('✅ Added failed_attempts column');
        }
        if (!userColNames.includes('locked_at')) {
            await db.query(`ALTER TABLE users ADD COLUMN locked_at DATETIME NULL`);
            migrations.push('✅ Added locked_at column');
        }

        const [tables] = await db.query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'audit_logs'
        `);

        if (!tables.length) {
            await db.query(`
                CREATE TABLE audit_logs (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id VARCHAR(255) NOT NULL,
                    action VARCHAR(255) NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id),
                    INDEX idx_created_at (created_at)
                )
            `);
            migrations.push('✅ Created audit_logs table');
        }

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

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        connectedDrivers: connectedDrivers.size,
        requestId: req.requestId
    });
});

app.get('/api/drivers/online', auth.protect, auth.adminOnly, (req, res) => {
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

// ---------- 404 & ERROR ----------
app.use((req, res) => {
    const notFoundPath = path.join(__dirname, 'public/pages', '404.html');
    if (fs.existsSync(notFoundPath)) {
        return res.status(404).sendFile(notFoundPath);
    }
    res.status(404).json({
        error: 'Page not found',
        path: req.path,
        requestId: req.requestId
    });
});

app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
        requestId: req.requestId
    });
});

async function initializeAppSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS resident_report_requests (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            resident_id BIGINT UNSIGNED NOT NULL,
            request_id CHAR(36) NOT NULL,
            report_id BIGINT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_resident_report_request (resident_id, request_id),
            INDEX idx_resident_report_requests_created_at (created_at)
        )
    `);
    await db.query(
        `DELETE FROM resident_report_requests
         WHERE created_at < NOW() - INTERVAL 30 DAY`
    );
}

const PORT = process.env.PORT || 5000;
initializeAppSchema().then(() => server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔒 Security: ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}`);
    console.log(`📱 Access: http://localhost:${PORT}/login`);
    console.log(`📱 Resident: http://localhost:${PORT}/resident`);
    console.log(`📱 Driver: http://localhost:${PORT}/driver`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
})).catch(async (err) => {
    console.error('Application schema initialization failed:', err);
    await db.end();
    process.exitCode = 1;
});