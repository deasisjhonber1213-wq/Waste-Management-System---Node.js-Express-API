
const db = require("../config/db");


exports.getTodayTruck = async (req, res) => {
    try {
        const [assignment] = await db.query(`
            SELECT ra.*, t.plate_number, t.model, r.zone_name
            FROM route_assignments ra
            JOIN trucks t ON ra.truck_id = t.id
            JOIN routes r ON ra.route_id = r.id
            JOIN users u ON u.id = ? AND u.role = 'resident'
            WHERE ra.assigned_date = CURDATE()
            ORDER BY ra.assigned_date DESC
            LIMIT 1
        `, [req.user.id]);

        res.json(assignment[0] || null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.getPickupSchedule = async (req, res) => {
    try {
        const [schedule] = await db.query(`
            SELECT ra.assigned_date, t.plate_number, r.zone_name, ra.status, ra.pickup_type
            FROM route_assignments ra
            JOIN trucks t ON ra.truck_id = t.id
            JOIN routes r ON ra.route_id = r.id
            JOIN users u ON u.id = ? AND u.role = 'resident'
            ORDER BY ra.assigned_date DESC
        `, [req.user.id]);

        res.json(schedule);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.getTruckLocation = async (req, res) => {
    try {
        const [logs] = await db.query(`
            SELECT latitude, longitude, recorded_at 
            FROM gps_logs 
            WHERE truck_id = ? 
            ORDER BY recorded_at DESC LIMIT 50
        `, [req.params.truckId]);

        res.json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.createReport = async (req, res) => {
    try {
        const { type, description } = req.body;
        await db.query(`
            INSERT INTO reports (resident_id,type,description) VALUES (?,?,?)
        `, [req.user.id, type, description]);
        res.json({ message: "Report submitted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getReports = async (req, res) => {
    try {
        const [reports] = await db.query(`
            SELECT * FROM reports WHERE resident_id = ? ORDER BY created_at DESC
        `, [req.user.id]);

        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getNotifications = async (req, res) => {
    try {
        const [notes] = await db.query(`
            SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC
        `, [req.user.id]);

        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getAnnouncements = async (req, res) => {
    try {
        const [data] = await db.query(`
            SELECT * FROM announcements ORDER BY created_at DESC
        `);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};