const path = require("path");
const db = require("../config/db");
const ExcelJS = require("exceljs");
const bcrypt = require("bcrypt");
const fs = require("fs");

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


exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, address, role, password } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: "Name and email are required" });
        }


        const [existing] = await db.query(
            "SELECT id FROM users WHERE id = ?",
            [id]
        );
        if (!existing.length) {
            return res.status(404).json({ error: "User not found" });
        }

        const [emailCheck] = await db.query(
            "SELECT id FROM users WHERE email = ? AND id != ?",
            [email, id]
        );
        if (emailCheck.length) {
            return res.status(400).json({ error: "Email already in use by another user" });
        }

        let query = "UPDATE users SET name = ?, email = ?, phone = ?, address = ?, role = ?";
        let values = [name, email, phone || null, address || null, role || 'resident'];


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

        const [existing] = await db.query(
            "SELECT id, name FROM users WHERE id = ?",
            [req.params.id]
        );
        if (!existing.length) {
            return res.status(404).json({ error: "User not found" });
        }


        if (req.params.id == req.user.id) {
            return res.status(400).json({ error: "You cannot delete your own account" });
        }

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

// ─────────────────────────────────────────────────────────
// MRF FACILITY LOCATIONS
// A standalone, admin-managed table of real-world MRF facility
// coordinates. The admin physically visits a site, drops a pin on
// its exact position, and saves it here. These are then rendered
// as a read-only reference layer on the route-drawing map and the
// route-detail map, so a route's own 🏭 MRF stop can be placed
// precisely on top of a real facility instead of eyeballed — and
// the admin can add or delete facilities at any time.
// ─────────────────────────────────────────────────────────
async function ensureMRFTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS mrf_locations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            address VARCHAR(255) NULL,
            latitude DECIMAL(10,7) NOT NULL,
            longitude DECIMAL(10,7) NOT NULL,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
}

exports.getMRFLocations = async (req, res) => {
    try {
        await ensureMRFTable();
        const [rows] = await db.query(
            "SELECT * FROM mrf_locations ORDER BY created_at DESC"
        );
        res.json(rows);
    } catch (err) {
        console.error("getMRFLocations error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getMRFLocationById = async (req, res) => {
    try {
        await ensureMRFTable();
        const [[row]] = await db.query(
            "SELECT * FROM mrf_locations WHERE id = ?",
            [req.params.id]
        );
        if (!row) return res.status(404).json({ error: "MRF location not found" });
        res.json(row);
    } catch (err) {
        console.error("getMRFLocationById error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.addMRFLocation = async (req, res) => {
    try {
        await ensureMRFTable();
        const { name, address, latitude, longitude } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ error: "Facility name is required" });
        }
        if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
            return res.status(400).json({ error: "Latitude and longitude are required" });
        }

        const [result] = await db.query(
            `INSERT INTO mrf_locations (name, address, latitude, longitude, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [String(name).trim(), address ? String(address).trim() : null, latitude, longitude, req.user?.id || null]
        );

        res.json({ message: "MRF location marked successfully", id: result.insertId });
    } catch (err) {
        console.error("addMRFLocation error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateMRFLocation = async (req, res) => {
    try {
        await ensureMRFTable();
        const { name, address, latitude, longitude } = req.body;

        const [[existing]] = await db.query(
            "SELECT id FROM mrf_locations WHERE id = ?",
            [req.params.id]
        );
        if (!existing) return res.status(404).json({ error: "MRF location not found" });

        const updates = [];
        const values = [];

        if (name !== undefined) {
            if (!String(name).trim()) return res.status(400).json({ error: "Facility name cannot be empty" });
            updates.push("name = ?");
            values.push(String(name).trim());
        }
        if (address !== undefined) {
            updates.push("address = ?");
            values.push(address ? String(address).trim() : null);
        }
        if (latitude !== undefined) {
            updates.push("latitude = ?");
            values.push(latitude);
        }
        if (longitude !== undefined) {
            updates.push("longitude = ?");
            values.push(longitude);
        }

        if (!updates.length) {
            return res.status(400).json({ error: "Nothing to update" });
        }

        values.push(req.params.id);
        await db.query(
            `UPDATE mrf_locations SET ${updates.join(", ")} WHERE id = ?`,
            values
        );

        res.json({ message: "MRF location updated successfully" });
    } catch (err) {
        console.error("updateMRFLocation error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteMRFLocation = async (req, res) => {
    try {
        await ensureMRFTable();
        const [[existing]] = await db.query(
            "SELECT id FROM mrf_locations WHERE id = ?",
            [req.params.id]
        );
        if (!existing) return res.status(404).json({ error: "MRF location not found" });

        await db.query("DELETE FROM mrf_locations WHERE id = ?", [req.params.id]);
        res.json({ message: "MRF location deleted successfully" });
    } catch (err) {
        console.error("deleteMRFLocation error:", err);
        res.status(500).json({ error: err.message });
    }
};

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
            r.created_at,
            r.image_url
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

        // Ensure image_url is properly formatted for each report
        const processedReports = reports.map(report => {
            if (report.image_url) {
                // If it's already a data URL, keep it as is
                if (!report.image_url.startsWith('data:image') && !report.image_url.startsWith('http')) {
                    report.image_url = `data:image/jpeg;base64,${report.image_url}`;
                }
            }
            return report;
        });

        res.json({
            data: processedReports,
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

exports.createAnnouncement = async (req, res) => {
    try {
        const { title, message, pickup_date, image_url } = req.body;
        if (!title || !message) {
            return res.status(400).json({ error: "Title and message required" });
        }

        let finalImageUrl = image_url || null;

        // Handle base64 image upload
        if (image_url && image_url.startsWith('data:image')) {
            try {
                // Extract the base64 data
                const matches = image_url.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const imageBuffer = Buffer.from(matches[2], 'base64');
                    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];

                    // Generate unique filename
                    const filename = `announcements/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extension}`;

                    // Ensure directory exists
                    const fs = require('fs');
                    const uploadDir = path.join(__dirname, '../public/uploads/announcements');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }

                    // Save file
                    const filePath = path.join(uploadDir, path.basename(filename));
                    fs.writeFileSync(filePath, imageBuffer);

                    // Return URL path (adjust based on your static file serving)
                    finalImageUrl = `/uploads/announcements/${path.basename(filename)}`;
                }
            } catch (err) {
                console.error('Error saving image:', err);
                // Continue without image if save fails
                finalImageUrl = null;
            }
        }

        const [cols] = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements'`
        );
        const colNames = cols.map(c => c.COLUMN_NAME);

        const fields = ["title", "message"];
        const values = [title, message];

        if (colNames.includes("pickup_date")) {
            fields.push("pickup_date");
            values.push(pickup_date || null);
        }
        if (colNames.includes("image_url")) {
            fields.push("image_url");
            values.push(finalImageUrl);
        }
        if (colNames.includes("created_by")) {
            fields.push("created_by");
            values.push(req.user.id);
        }

        await db.query(
            `INSERT INTO announcements (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`,
            values
        );

        res.json({
            message: "Announcement created successfully",
            image_url: finalImageUrl
        });
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