const path = require("path");
const db = require("../config/db");
const ExcelJS = require("exceljs");
const bcrypt = require("bcrypt");

exports.dashboardStats = async (req, res) => {
    try {
        const [[users]] = await db.query("SELECT COUNT(*) total FROM users");
        const [[drivers]] = await db.query("SELECT COUNT(*) total FROM users WHERE role='driver'");
        const [[trucks]] = await db.query("SELECT COUNT(*) total FROM trucks");
        const [[routes]] = await db.query("SELECT COUNT(*) total FROM routes");
        const [[reports]] = await db.query("SELECT COUNT(*) total FROM reports");
        const [[fuel]] = await db.query("SELECT SUM(fuel_used) total FROM trip_logs");

        res.json({
            totalUsers: users.total,
            totalDrivers: drivers.total,
            totalTrucks: trucks.total,
            totalRoutes: routes.total,
            totalReports: reports.total,
            totalFuelUsed: fuel.total || 0,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// USER MANAGEMENT (UPDATED)
// ============================================

exports.getUsers = async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, name, email, role, phone, address FROM users"
        );
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// Get single user by ID
exports.getUserById = async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, name, email, role, phone, address FROM users WHERE id = ?",
            [req.params.id]
        );
        if (!users.length) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json(users[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// Update user (including password)
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, address, role, password } = req.body;

        // Validate required fields
        if (!name || !email) {
            return res.status(400).json({ error: "Name and email are required" });
        }

        // Check if user exists
        const [existing] = await db.query(
            "SELECT id FROM users WHERE id = ?",
            [id]
        );
        if (!existing.length) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if email is already taken by another user
        const [emailCheck] = await db.query(
            "SELECT id FROM users WHERE email = ? AND id != ?",
            [email, id]
        );
        if (emailCheck.length) {
            return res.status(400).json({ error: "Email already in use by another user" });
        }

        let query = "UPDATE users SET name = ?, email = ?, phone = ?, address = ?, role = ?";
        let values = [name, email, phone || null, address || null, role || 'resident'];

        // If password is provided, hash and update it
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: "Password must be at least 6 characters" });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ", password = ?";
            values.push(hashedPassword);
        }

        query += " WHERE id = ?";
        values.push(id);

        await db.query(query, values);

        // Log the update
        await db.query(
            "INSERT INTO audit_logs (user_id, action) VALUES (?, ?)",
            [req.user.id, `Updated user ID ${id}`]
        );

        res.json({ message: "User updated successfully" });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        // Check if user exists
        const [existing] = await db.query(
            "SELECT id, name FROM users WHERE id = ?",
            [req.params.id]
        );
        if (!existing.length) {
            return res.status(404).json({ error: "User not found" });
        }

        // Prevent deleting yourself
        if (req.params.id == req.user.id) {
            return res.status(400).json({ error: "You cannot delete your own account" });
        }

        // Check if user has any active assignments (if driver)
        const [assignments] = await db.query(
            `SELECT id FROM route_assignments 
             WHERE driver_id = ? AND status IN ('pending', 'in_progress')
             LIMIT 1`,
            [req.params.id]
        );
        if (assignments.length) {
            return res.status(409).json({
                error: "Cannot delete — user has active route assignments"
            });
        }

        await db.query("DELETE FROM users WHERE id=?", [req.params.id]);
        await db.query(
            "INSERT INTO audit_logs (user_id, action) VALUES (?, ?)",
            [req.user.id, `Deleted user ID ${req.params.id}`]
        );
        res.json({ message: "User deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// TRUCK MANAGEMENT
// ============================================

exports.addTruck = async (req, res) => {
    try {
        const { plate_number, model } = req.body;
        if (!plate_number) return res.status(400).json({ error: "Plate number is required" });
        await db.query(
            "INSERT INTO trucks (plate_number, model) VALUES (?, ?)",
            [plate_number, model || null]
        );
        res.json({ message: "Truck added successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getTrucks = async (req, res) => {
    try {
        const [trucks] = await db.query(
            "SELECT * FROM trucks ORDER BY id DESC"
        );
        res.json(trucks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.editTruck = async (req, res) => {
    try {
        const { plate_number, model } = req.body;
        if (!plate_number) return res.status(400).json({ error: "Plate number is required" });
        await db.query(
            "UPDATE trucks SET plate_number=?, model=? WHERE id=?",
            [plate_number, model || null, req.params.id]
        );
        res.json({ message: "Truck updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteTruck = async (req, res) => {
    try {
        const [[activeAssignment]] = await db.query(
            `SELECT id FROM route_assignments
             WHERE truck_id = ? AND status IN ('pending', 'in_progress')
             LIMIT 1`,
            [req.params.id]
        );
        if (activeAssignment) {
            return res.status(409).json({
                error: "Cannot delete — truck is assigned to an active or pending route."
            });
        }
        await db.query("DELETE FROM trucks WHERE id=?", [req.params.id]);
        res.json({ message: "Truck deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateTruckLocation = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "latitude and longitude are required" });
        }
        await db.query(
            "UPDATE trucks SET latitude=?, longitude=?, location_updated_at=NOW() WHERE id=?",
            [latitude, longitude, req.params.id]
        );
        res.json({ message: "Location updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// ROUTE MANAGEMENT
// ============================================

exports.addRoute = async (req, res) => {
    try {
        const { zone_name, description, waypoints_json, path_mode } = req.body;

        if (!zone_name) {
            return res.status(400).json({ error: "Zone name is required" });
        }

        let waypointsData = null;
        if (waypoints_json) {
            try {
                const parsed = JSON.parse(waypoints_json);
                if (!parsed.road && !parsed.pins && !parsed.mrf) {
                    waypointsData = JSON.stringify({
                        road: Array.isArray(parsed) ? parsed : [],
                        pins: [],
                        mrf: []
                    });
                } else {
                    waypointsData = waypoints_json;
                }
            } catch (e) {
                console.error('Invalid JSON:', e);
                waypointsData = JSON.stringify({ road: [], pins: [], mrf: [] });
            }
        } else {
            waypointsData = JSON.stringify({ road: [], pins: [], mrf: [] });
        }

        const [columns] = await db.query(
            `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'routes'`
        );
        const colNames = columns.map(c => c.COLUMN_NAME);
        const hasWaypoints = colNames.includes('waypoints_json');
        const hasPathMode = colNames.includes('path_mode');

        const pathModeCol = columns.find(c => c.COLUMN_NAME === 'path_mode');
        const isPathModeJSON = pathModeCol && pathModeCol.DATA_TYPE === 'json';

        let query = `INSERT INTO routes (zone_name, description`;
        let values = [zone_name, description || null];
        let placeholders = ['?', '?'];

        if (hasWaypoints) {
            query += `, waypoints_json`;
            values.push(waypointsData);
            placeholders.push('?');
        }

        if (hasPathMode) {
            query += `, path_mode`;
            if (isPathModeJSON) {
                values.push(JSON.stringify(path_mode || 'pin'));
            } else {
                values.push(path_mode || 'pin');
            }
            placeholders.push('?');
        }

        query += `) VALUES (${placeholders.join(', ')})`;

        await db.query(query, values);
        res.json({ message: "Route added successfully" });

    } catch (err) {
        console.error('Add route error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateRoute = async (req, res) => {
    try {
        const { zone_name, description, waypoints_json, path_mode } = req.body;

        if (!zone_name) {
            return res.status(400).json({ error: "Zone name is required" });
        }

        let waypointsData = null;
        if (waypoints_json) {
            try {
                const parsed = JSON.parse(waypoints_json);
                waypointsData = waypoints_json;
            } catch (e) {
                console.error('Invalid JSON:', e);
                waypointsData = JSON.stringify({ road: [], pins: [], mrf: [] });
            }
        }

        const [columns] = await db.query(
            `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'routes'`
        );
        const colNames = columns.map(c => c.COLUMN_NAME);

        const pathModeCol = columns.find(c => c.COLUMN_NAME === 'path_mode');
        const isPathModeJSON = pathModeCol && pathModeCol.DATA_TYPE === 'json';

        const updates = ['zone_name = ?', 'description = ?'];
        const values = [zone_name, description || null];

        if (colNames.includes('waypoints_json')) {
            updates.push('waypoints_json = ?');
            values.push(waypointsData || JSON.stringify({ road: [], pins: [], mrf: [] }));
        }

        if (colNames.includes('path_mode')) {
            updates.push('path_mode = ?');
            if (isPathModeJSON) {
                values.push(JSON.stringify(path_mode || 'pin'));
            } else {
                values.push(path_mode || 'pin');
            }
        }

        values.push(req.params.id);

        await db.query(
            `UPDATE routes SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        res.json({ message: "Route updated successfully" });
    } catch (err) {
        console.error('Update route error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getRoutes = async (req, res) => {
    try {
        const [routes] = await db.query("SELECT * FROM routes ORDER BY created_at DESC");

        const processedRoutes = routes.map(route => {
            if (route.waypoints_json) {
                if (typeof route.waypoints_json === 'object') {
                    return route;
                }
                try {
                    route.waypoints_json = JSON.parse(route.waypoints_json);
                } catch (e) {
                    console.error('Error parsing waypoints for route', route.id, e);
                }
            }
            return route;
        });

        res.json(processedRoutes);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteRoute = async (req, res) => {
    try {
        // Check if route is being used
        const [assignments] = await db.query(
            `SELECT id FROM route_assignments WHERE route_id = ? AND status IN ('pending', 'in_progress') LIMIT 1`,
            [req.params.id]
        );
        if (assignments.length) {
            return res.status(409).json({
                error: "Cannot delete — route is assigned to an active or pending schedule."
            });
        }

        await db.query("DELETE FROM routes WHERE id=?", [req.params.id]);
        res.json({ message: "Route deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// ROUTE ASSIGNMENT
// ============================================

exports.assignRoute = async (req, res) => {
    try {
        const { driver_id, truck_id, route_id, assigned_date, pickup_type } = req.body;
        await db.query(
            `INSERT INTO route_assignments
                (driver_id, truck_id, route_id, assigned_date, pickup_type, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [driver_id, truck_id, route_id, assigned_date, pickup_type || "regular"]
        );
        res.json({ message: "Route assigned successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// REPORTS FUNCTIONS WITH LONGTEXT SUPPORT
// ============================================

exports.getReports = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const status = req.query.status;
        const type = req.query.type;

        const [columns] = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'`
        );
        const colNames = columns.map(c => c.COLUMN_NAME);

        const hasResidentId = colNames.includes('resident_id');
        const hasStatus = colNames.includes('status');

        let whereClause = [];
        let params = [];

        if (status && status !== 'all' && hasStatus) {
            whereClause.push('r.status = ?');
            params.push(status);
        }

        if (type && type !== 'all') {
            whereClause.push('r.type = ?');
            params.push(type);
        }

        const whereStr = whereClause.length ? `WHERE ${whereClause.join(' AND ')}` : '';

        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM reports r ${whereStr}`,
            params
        );
        const total = countResult[0].total;

        let selectCols = `
            r.id,
            r.type,
            r.description,
            r.latitude,
            r.longitude,
            r.created_at
        `;

        if (hasStatus) selectCols += `, r.status`;
        if (hasResidentId) {
            selectCols += `, r.resident_id AS user_id, u.name AS resident_name, u.email AS resident_email`;
        } else {
            selectCols += `, NULL AS user_id, NULL AS resident_name, NULL AS resident_email`;
        }

        let query = `
            SELECT ${selectCols}
            FROM reports r
            ${hasResidentId ? 'LEFT JOIN users u ON u.id = r.resident_id' : ''}
            ${whereStr}
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const [reports] = await db.query(query, [...params, limit, offset]);

        res.json({
            data: reports,
            pagination: {
                current_page: page,
                per_page: limit,
                total: total,
                total_pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Error in getReports:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getReportById = async (req, res) => {
    try {
        const { id } = req.params;

        const [columns] = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'`
        );
        const colNames = columns.map(c => c.COLUMN_NAME);
        const hasResidentId = colNames.includes('resident_id');

        let query = `
            SELECT 
                r.*,
                ${hasResidentId ? 'u.name as resident_name, u.email as resident_email, u.phone as resident_phone' : 'NULL as resident_name, NULL as resident_email, NULL as resident_phone'}
            FROM reports r
            ${hasResidentId ? 'LEFT JOIN users u ON u.id = r.resident_id' : ''}
            WHERE r.id = ?
        `;

        const [reports] = await db.query(query, [id]);

        if (!reports.length) {
            return res.status(404).json({ error: "Report not found" });
        }

        const report = reports[0];

        if (report.image_url) {
            if (!report.image_url.startsWith('data:image') && !report.image_url.startsWith('http')) {
                report.image_url = `data:image/jpeg;base64,${report.image_url}`;
            }
        }

        res.json(report);
    } catch (err) {
        console.error('Error in getReportById:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateReportStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_notes } = req.body;

        const validStatuses = ['pending', 'in_progress', 'resolved', 'rejected'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status. Must be: pending, in_progress, resolved, rejected" });
        }

        const [columns] = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'`
        );
        const colNames = columns.map(c => c.COLUMN_NAME);
        const hasStatus = colNames.includes('status');
        const hasAdminNotes = colNames.includes('admin_notes');

        if (!hasStatus) {
            return res.status(400).json({ error: "Status column does not exist in reports table" });
        }

        const [existing] = await db.query(
            `SELECT id FROM reports WHERE id = ?`,
            [id]
        );

        if (!existing.length) {
            return res.status(404).json({ error: "Report not found" });
        }

        const updates = ['status = ?', 'updated_at = NOW()'];
        const values = [status || 'pending'];

        if (hasAdminNotes && admin_notes !== undefined) {
            updates.push('admin_notes = ?');
            values.push(admin_notes || null);
        }

        values.push(id);

        await db.query(
            `UPDATE reports SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        const [updated] = await db.query(
            `SELECT r.*, u.name as resident_name
             FROM reports r
             LEFT JOIN users u ON u.id = r.resident_id
             WHERE r.id = ?`,
            [id]
        );

        if (updated[0] && updated[0].image_url) {
            if (!updated[0].image_url.startsWith('data:image') && !updated[0].image_url.startsWith('http')) {
                updated[0].image_url = `data:image/jpeg;base64,${updated[0].image_url}`;
            }
        }

        res.json({
            message: "Report updated successfully",
            report: updated[0]
        });
    } catch (err) {
        console.error('Error in updateReportStatus:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteReport = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await db.query(
            `SELECT id, image_url FROM reports WHERE id = ?`,
            [id]
        );

        if (!existing.length) {
            return res.status(404).json({ error: "Report not found" });
        }

        await db.query(`DELETE FROM reports WHERE id = ?`, [id]);

        await db.query(
            "INSERT INTO audit_logs (user_id, action) VALUES (?, ?)",
            [req.user.id, `Deleted report ID ${id}`]
        );

        res.json({ message: "Report deleted successfully" });
    } catch (err) {
        console.error('Error in deleteReport:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.reportAnalytics = async (req, res) => {
    try {
        const [columns] = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'`
        );
        const colNames = columns.map(c => c.COLUMN_NAME);
        const hasStatus = colNames.includes('status');

        let query = `
            SELECT 
                type, 
                COUNT(*) AS total,
                MIN(created_at) AS first_report,
                MAX(created_at) AS last_report
            FROM reports
        `;

        if (hasStatus) {
            query += `
                GROUP BY type
                UNION ALL
                SELECT 
                    'ALL' AS type,
                    COUNT(*) AS total,
                    MIN(created_at) AS first_report,
                    MAX(created_at) AS last_report
                FROM reports
            `;
        } else {
            query += ` GROUP BY type`;
        }

        const [data] = await db.query(query);

        let statusBreakdown = [];
        if (hasStatus) {
            const [statusData] = await db.query(`
                SELECT status, COUNT(*) AS total
                FROM reports
                GROUP BY status
            `);
            statusBreakdown = statusData;
        }

        res.json({
            type_breakdown: data,
            status_breakdown: statusBreakdown,
            total_reports: data.reduce((sum, item) => sum + item.total, 0)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.exportAnalytics = async (req, res) => {
    try {
        const [data] = await db.query(
            "SELECT type, COUNT(*) total FROM reports GROUP BY type"
        );

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Analytics");

        sheet.columns = [
            { header: "Report Type", key: "type", width: 24 },
            { header: "Total Reports", key: "total", width: 16 },
        ];

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).alignment = { horizontal: "center" };

        sheet.addRows(data);

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=analytics-${new Date().toISOString().slice(0, 10)}.xlsx`
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// RESIDENT LOCATIONS
// ============================================

exports.getResidentLocations = async (req, res) => {
    try {
        const [residents] = await db.query(
            `SELECT id, name, latitude, longitude, location_updated_at, address
             FROM users
             WHERE role = 'resident'
               AND latitude IS NOT NULL
               AND longitude IS NOT NULL
               AND location_updated_at > NOW() - INTERVAL 2 HOUR
             ORDER BY location_updated_at DESC`
        );
        res.json(residents);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// ANNOUNCEMENTS
// ============================================

exports.createAnnouncement = async (req, res) => {
    try {
        const { title, message, pickup_date, image_url } = req.body;
        if (!title || !message) {
            return res.status(400).json({ error: "Title and message required" });
        }

        const [cols] = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements'`
        );
        const colNames = cols.map(c => c.COLUMN_NAME);

        const fields = ["title", "message"];
        const values = [title, message];

        if (colNames.includes("pickup_date")) { fields.push("pickup_date"); values.push(pickup_date || null); }
        if (colNames.includes("image_url")) { fields.push("image_url"); values.push(image_url || null); }
        if (colNames.includes("created_by")) { fields.push("created_by"); values.push(req.user.id); }

        await db.query(
            `INSERT INTO announcements (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`,
            values
        );
        res.json({ message: "Announcement created successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getAnnouncements = async (req, res) => {
    try {
        const [cols] = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements'`
        );
        const colNames = cols.map(c => c.COLUMN_NAME);

        const hasCreatedAt = colNames.includes("created_at");
        const hasImageUrl = colNames.includes("image_url");
        const hasCreatedBy = colNames.includes("created_by");

        const selectCols = [
            "a.id", "a.title", "a.message",
            hasImageUrl ? "a.image_url" : "NULL AS image_url",
            hasCreatedAt ? "a.created_at" : "NULL AS created_at",
            hasCreatedBy ? "COALESCE(u.name, 'Admin') AS admin_name" : "'Admin' AS admin_name",
        ];
        const joinClause = hasCreatedBy ? "LEFT JOIN users u ON a.created_by = u.id" : "";
        const orderClause = hasCreatedAt ? "ORDER BY a.created_at DESC" : "ORDER BY a.id DESC";

        const [data] = await db.query(
            `SELECT ${selectCols.join(", ")}
             FROM announcements a
             ${joinClause}
             ${orderClause}`
        );
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteAnnouncement = async (req, res) => {
    try {
        await db.query("DELETE FROM announcements WHERE id=?", [req.params.id]);
        res.json({ message: "Announcement deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// PROFILE
// ============================================

exports.getProfile = async (req, res) => {
    try {
        const [[user]] = await db.query(
            "SELECT id, name, email, phone, address FROM users WHERE id=?",
            [req.user.id]
        );
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;
        await db.query(
            "UPDATE users SET name=?, email=?, phone=?, address=? WHERE id=?",
            [name, email, phone, address, req.user.id]
        );
        res.json({ message: "Profile updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// PICKUPS / SCHEDULES
// ============================================

exports.getPickups = async (req, res) => {
    try {
        const [pickups] = await db.query(`
            SELECT
                ra.*,
                u.name        AS driver_name,
                t.plate_number AS truck_plate,
                r.zone_name
            FROM route_assignments ra
            JOIN users  u ON ra.driver_id = u.id
            JOIN trucks t ON ra.truck_id  = t.id
            JOIN routes r ON ra.route_id  = r.id
            ORDER BY ra.assigned_date DESC
        `);
        res.json(pickups);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.updatePickup = async (req, res) => {
    try {
        const { driver_id, truck_id, route_id, assigned_date, status, pickup_type } = req.body;
        const updates = [];
        const values = [];

        if (driver_id !== undefined) { updates.push("driver_id=?"); values.push(driver_id); }
        if (truck_id !== undefined) { updates.push("truck_id=?"); values.push(truck_id); }
        if (route_id !== undefined) { updates.push("route_id=?"); values.push(route_id); }
        if (assigned_date) { updates.push("assigned_date=?"); values.push(assigned_date); }
        if (status) { updates.push("status=?"); values.push(status); }
        if (pickup_type) { updates.push("pickup_type=?"); values.push(pickup_type); }

        if (updates.length === 0) {
            return res.status(400).json({ error: "Nothing to update" });
        }

        values.push(req.params.id);

        await db.query(
            `UPDATE route_assignments SET ${updates.join(", ")} WHERE id=?`,
            values
        );

        res.json({ message: "Pickup schedule updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.deletePickup = async (req, res) => {
    try {
        await db.query("DELETE FROM route_assignments WHERE id=?", [req.params.id]);
        res.json({ message: "Pickup schedule deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};