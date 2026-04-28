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


exports.addRoute = async (req, res) => {
    try {
        const { zone_name, description, waypoints_json } = req.body;
        if (!zone_name) return res.status(400).json({ error: "Zone name is required" });
        await db.query(
            "INSERT INTO routes (zone_name, description, waypoints_json) VALUES (?, ?, ?)",
            [zone_name, description || null, waypoints_json || null]
        );
        res.json({ message: "Route added successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateRoute = async (req, res) => {
    try {
        const { zone_name, description, waypoints_json } = req.body;
        if (!zone_name) return res.status(400).json({ error: "Zone name is required" });
        await db.query(
            "UPDATE routes SET zone_name=?, description=?, waypoints_json=? WHERE id=?",
            [zone_name, description || null, waypoints_json || null, req.params.id]
        );
        res.json({ message: "Route updated successfully" });
    } catch (err) {
        console.error(err);
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
        const [reports] = await db.query(
            "SELECT * FROM reports ORDER BY created_at DESC"
        );
        res.json(reports);
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