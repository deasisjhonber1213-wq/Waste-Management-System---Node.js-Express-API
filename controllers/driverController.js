const path = require("path");
const db = require("../config/db");


exports.getTodayAssignment = async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const [[assignment]] = await db.query(
            `SELECT
                ra.id,
                ra.assigned_date,
                ra.status,
                ra.pickup_type,
                r.zone_name,
                r.description   AS zone_description,
                t.id            AS truck_id,
                t.plate_number,
                t.model,
                t.latitude,
                t.longitude
             FROM route_assignments ra
             JOIN routes r  ON ra.route_id = r.id
             JOIN trucks t  ON ra.truck_id  = t.id
             WHERE ra.driver_id = ? AND ra.assigned_date = ?
             LIMIT 1`,
            [req.user.id, today]
        );
        res.json(assignment || null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.updateAssignmentStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ["pending", "in_progress", "completed"];
        if (!allowed.includes(status)) {
            return res.status(400).json({ error: "Invalid status value" });
        }


        const [[row]] = await db.query(
            "SELECT id FROM route_assignments WHERE id=? AND driver_id=?",
            [req.params.id, req.user.id]
        );
        if (!row) return res.status(403).json({ error: "Not authorised" });

        await db.query(
            "UPDATE route_assignments SET status=? WHERE id=?",
            [status, req.params.id]
        );


        if (status === "completed") {
            await db.query(
                `INSERT INTO trip_logs (assignment_id, completed_at, status)
                 VALUES (?, NOW(), 'completed')
                 ON DUPLICATE KEY UPDATE completed_at = NOW(), status = 'completed'`,
                [req.params.id]
            );
        }

        res.json({ message: `Status updated to ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.getMySchedule = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT
                ra.id,
                ra.assigned_date,
                ra.status,
                ra.pickup_type,
                r.zone_name,
                t.plate_number,
                t.model
             FROM route_assignments ra
             JOIN routes r ON ra.route_id = r.id
             JOIN trucks t ON ra.truck_id  = t.id
             WHERE ra.driver_id = ?
             ORDER BY ra.assigned_date DESC
             LIMIT 30`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.updateMyLocation = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "latitude and longitude required" });
        }

        const today = new Date().toISOString().slice(0, 10);
        const [[assignment]] = await db.query(
            `SELECT truck_id FROM route_assignments
             WHERE driver_id=? AND assigned_date=? LIMIT 1`,
            [req.user.id, today]
        );

        if (!assignment) {
            return res.status(404).json({ error: "No truck assigned today" });
        }


        await db.query(
            "UPDATE trucks SET latitude=?, longitude=? WHERE id=?",
            [latitude, longitude, assignment.truck_id]
        );

        await db.query(
            `INSERT INTO trip_logs (assignment_id, latitude, longitude, logged_at)
             SELECT ra.id, ?, ?, NOW()
             FROM route_assignments ra
             WHERE ra.driver_id = ? AND ra.assigned_date = ?
             LIMIT 1`,
            [latitude, longitude, req.user.id, today]
        );

        res.json({ message: "Location updated" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.submitReport = async (req, res) => {
    try {
        const { type, description, location_note } = req.body;
        if (!type || !description) {
            return res.status(400).json({ error: "Type and description required" });
        }
        await db.query(
            `INSERT INTO reports (resident_id, type, description, location_note, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [req.user.id, type, description, location_note || null]
        );
        res.json({ message: "Report submitted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.getMyReports = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, type, description, location_note, created_at
             FROM reports
             WHERE resident_id=?
             ORDER BY created_at DESC
             LIMIT 20`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.getAnnouncements = async (req, res) => {
    try {

        const [cols] = await db.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'announcements'`
        );
        const colNames = cols.map(c => c.COLUMN_NAME);

        const hasImageUrl = colNames.includes("image_url");
        const hasCreatedAt = colNames.includes("created_at");
        const hasCreatedBy = colNames.includes("created_by");

        const imageCol = hasImageUrl ? "a.image_url" : "NULL AS image_url";
        const dateCol = hasCreatedAt ? "a.created_at" : "NULL AS created_at";
        const adminJoin = hasCreatedBy
            ? "JOIN users u ON a.created_by = u.id"
            : "LEFT JOIN users u ON 1=0";  // no match — admin_name will be NULL
        const adminCol = "COALESCE(u.name, 'Admin') AS admin_name";
        const orderClause = hasCreatedAt ? "ORDER BY a.created_at DESC" : "ORDER BY a.id DESC";

        const [rows] = await db.query(
            `SELECT a.id, a.title, a.message,
                    ${imageCol}, ${dateCol}, ${adminCol}
             FROM announcements a
             ${adminJoin}
             ${orderClause}
             LIMIT 10`
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.getTripHistory = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT
                tl.id,
                COALESCE(tl.completed_at, tl.end_time, ra.assigned_date) AS completed_at,
                ra.assigned_date,
                ra.pickup_type,
                ra.status,
                r.zone_name,
                t.plate_number
             FROM trip_logs tl
             JOIN route_assignments ra ON tl.assignment_id = ra.id
             JOIN routes r  ON ra.route_id = r.id
             JOIN trucks t  ON ra.truck_id  = t.id
             WHERE ra.driver_id = ?
             ORDER BY COALESCE(tl.completed_at, tl.end_time, tl.logged_at) DESC
             LIMIT 20`,
            [req.user.id]
        );
        res.json(rows);
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
        const { name, phone, address } = req.body;
        await db.query(
            "UPDATE users SET name=?, phone=?, address=? WHERE id=?",
            [name, phone, address, req.user.id]
        );
        res.json({ message: "Profile updated" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
// Add this to your existing driverController.js

// Get route waypoints for today's assignment
exports.getRouteWaypoints = async (req, res) => {
    try {
        const [[assignment]] = await db.query(
            `SELECT r.waypoints_json, r.zone_name, r.description, 
                    r.start_location_lat, r.start_location_lng,
                    r.end_location_lat, r.end_location_lng
             FROM route_assignments ra
             JOIN routes r ON ra.route_id = r.id
             WHERE ra.driver_id = ? AND ra.assigned_date = CURDATE()
             LIMIT 1`,
            [req.user.id]
        );

        let waypoints = [];
        let startPoint = null;
        let endPoint = null;

        if (assignment) {
            // Parse waypoints if they exist
            if (assignment.waypoints_json) {
                try {
                    waypoints = JSON.parse(assignment.waypoints_json);
                } catch (e) {
                    console.error('Invalid waypoints JSON');
                }
            }

            // Get start and end locations
            if (assignment.start_location_lat && assignment.start_location_lng) {
                startPoint = {
                    lat: assignment.start_location_lat,
                    lng: assignment.start_location_lng,
                    name: "Starting Point"
                };
            }

            if (assignment.end_location_lat && assignment.end_location_lng) {
                endPoint = {
                    lat: assignment.end_location_lat,
                    lng: assignment.end_location_lng,
                    name: "Depot / End Point"
                };
            }
        }

        res.json({
            waypoints: waypoints,
            startPoint: startPoint,
            endPoint: endPoint,
            zone_name: assignment?.zone_name,
            description: assignment?.description
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// Get real-time traffic data (optional - requires external API)
exports.getTrafficData = async (req, res) => {
    try {
        const { lat, lng } = req.query;
        // You can integrate with TomTom, Google Maps, or Here API for traffic data
        // For now, return mock data
        res.json({
            status: "moderate",
            delay: 5, // minutes
            incidents: []
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// Save completed route tracking
exports.saveRouteTracking = async (req, res) => {
    try {
        const { route_data, distance_covered, time_taken } = req.body;

        await db.query(
            `INSERT INTO route_tracking (assignment_id, driver_id, route_data, distance_covered, time_taken, tracked_at)
             SELECT ra.id, ?, ?, ?, ?, NOW()
             FROM route_assignments ra
             WHERE ra.driver_id = ? AND ra.assigned_date = CURDATE()
             LIMIT 1`,
            [req.user.id, JSON.stringify(route_data), distance_covered, time_taken, req.user.id]
        );

        res.json({ message: "Route tracking saved" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
// Add these GPS accuracy improvements to your driverController.js

// Enhanced location update with accuracy tracking
exports.updateMyLocation = async (req, res) => {
    try {
        const { latitude, longitude, accuracy, heading, speed } = req.body;
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "latitude and longitude required" });
        }

        const today = new Date().toISOString().slice(0, 10);
        const [[assignment]] = await db.query(
            `SELECT truck_id FROM route_assignments
             WHERE driver_id=? AND assigned_date=? LIMIT 1`,
            [req.user.id, today]
        );

        if (!assignment) {
            return res.status(404).json({ error: "No truck assigned today" });
        }

        // Update truck location with accuracy and heading
        await db.query(
            "UPDATE trucks SET latitude=?, longitude=?, gps_accuracy=?, heading=?, speed=?, last_location_update=NOW() WHERE id=?",
            [latitude, longitude, accuracy || null, heading || null, speed || null, assignment.truck_id]
        );

        // Log the location with accuracy metadata
        await db.query(
            `INSERT INTO trip_logs (assignment_id, latitude, longitude, gps_accuracy, heading, speed, logged_at)
             SELECT ra.id, ?, ?, ?, ?, ?, NOW()
             FROM route_assignments ra
             WHERE ra.driver_id = ? AND ra.assigned_date = ?
             LIMIT 1`,
            [latitude, longitude, accuracy || null, heading || null, speed || null, req.user.id, today]
        );

        res.json({ message: "Location updated", accuracy: accuracy });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// Get real-time truck positions with accuracy filtering
exports.getNearbyTrucks = async (req, res) => {
    try {
        const { lat, lng, radius_km = 5 } = req.query;

        const [trucks] = await db.query(
            `SELECT t.id, t.plate_number, t.latitude, t.longitude, t.gps_accuracy, t.heading, t.speed,
                    u.name AS driver_name,
                    (6371 * acos(cos(radians(?)) * cos(radians(t.latitude)) * 
                    cos(radians(t.longitude) - radians(?)) + 
                    sin(radians(?)) * sin(radians(t.latitude)))) AS distance_km
             FROM trucks t
             JOIN route_assignments ra ON t.id = ra.truck_id
             JOIN users u ON ra.driver_id = u.id
             WHERE ra.assigned_date = CURDATE()
               AND t.latitude IS NOT NULL
               AND t.gps_accuracy < 50  -- Only show accurate GPS (less than 50m error)
             HAVING distance_km < ?
             ORDER BY distance_km`,
            [lat, lng, lat, radius_km]
        );

        res.json(trucks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};