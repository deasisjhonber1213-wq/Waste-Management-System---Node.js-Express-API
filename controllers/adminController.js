const path = require("path");
const db = require("../config/db");
const ExcelJS = require("exceljs");

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

exports.deleteUser = async (req, res) => {
    try {
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


// FIXED: Better error handling and JSON validation
exports.addRoute = async (req, res) => {
    try {
        const { zone_name, description, waypoints_json, path_mode } = req.body;

        if (!zone_name) {
            return res.status(400).json({ error: "Zone name is required" });
        }

        // Validate waypoints_json is valid JSON
        let waypointsData = null;
        if (waypoints_json) {
            try {
                // Parse to validate JSON structure
                const parsed = JSON.parse(waypoints_json);
                // Ensure it has the expected structure
                if (!parsed.road && !parsed.pins && !parsed.mrf) {
                    // Convert old format if needed
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
                // If invalid, store as empty structure
                waypointsData = JSON.stringify({ road: [], pins: [], mrf: [] });
            }
        } else {
            waypointsData = JSON.stringify({ road: [], pins: [], mrf: [] });
        }

        // Check if columns exist
        const [columns] = await db.query(
            `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'routes'`
        );
        const colNames = columns.map(c => c.COLUMN_NAME);
        const hasWaypoints = colNames.includes('waypoints_json');
        const hasPathMode = colNames.includes('path_mode');

        // Check if path_mode is JSON type
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
            // If JSON type, store as JSON, otherwise as string
            if (isPathModeJSON) {
                values.push(JSON.stringify(path_mode || 'pin')); // ← Store as JSON string
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

// FIXED: Update route with better error handling
exports.updateRoute = async (req, res) => {
    try {
        const { zone_name, description, waypoints_json, path_mode } = req.body;

        if (!zone_name) {
            return res.status(400).json({ error: "Zone name is required" });
        }

        // Validate waypoints_json
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

        // Build update query dynamically based on existing columns
        const [columns] = await db.query(
            `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'routes'`
        );
        const colNames = columns.map(c => c.COLUMN_NAME);

        // Check if path_mode is JSON type
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
            // If JSON type, store as JSON, otherwise as string
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
        res.json(routes);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteRoute = async (req, res) => {
    try {
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


exports.getReports = async (req, res) => {
    try {
        // First, check what columns exist in the reports table
        const [columns] = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'`
        );
        const colNames = columns.map(c => c.COLUMN_NAME);

        // Check if resident_id column exists
        const hasResidentId = colNames.includes('resident_id');

        let query = `
            SELECT
                r.id,
                r.type,
                r.description,
                r.latitude,
                r.longitude,
                r.image_url,
                r.created_at
        `;

        // Add resident_id if it exists
        if (hasResidentId) {
            query += `, r.resident_id AS user_id, u.name AS resident_name`;
        } else {
            query += `, NULL AS user_id, NULL AS resident_name`;
        }

        query += ` FROM reports r`;

        // Add JOIN if resident_id exists
        if (hasResidentId) {
            query += ` LEFT JOIN users u ON u.id = r.resident_id`;
        }

        query += ` ORDER BY r.created_at DESC`;

        const [reports] = await db.query(query);

        // Process each report to ensure image_url is properly formatted
        const processedReports = reports.map(report => {
            // If image_url exists and is a base64 string, make sure it has the proper prefix
            if (report.image_url) {
                // Check if it's already a data URL
                if (!report.image_url.startsWith('data:image') && !report.image_url.startsWith('http')) {
                    // Assume it's raw base64, add the prefix
                    report.image_url = `data:image/jpeg;base64,${report.image_url}`;
                }
            }
            return report;
        });

        res.json(processedReports);
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


exports.reportAnalytics = async (req, res) => {
    try {
        const [data] = await db.query(
            "SELECT type, COUNT(*) total FROM reports GROUP BY type"
        );
        res.json(data);
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