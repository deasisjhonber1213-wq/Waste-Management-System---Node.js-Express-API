const db = require("../config/db");

exports.getTodayAssignment = async (req, res) => {
    try {
        console.log("=== getTodayAssignment Debug ===");
        console.log("Driver ID:", req.user?.id);

        if (!req.user || !req.user.id) {
            console.error("No user ID in request");
            return res.status(401).json({ error: "User not authenticated" });
        }

        // Fix timezone issue - get Philippine time
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        console.log("Today's date (Philippines):", today);

        const [assignments] = await db.query(
            `SELECT
                ra.id,
                ra.assigned_date,
                ra.status,
                ra.pickup_type,
                r.id as route_id,
                r.zone_name,
                r.description AS zone_description,
                t.id AS truck_id,
                t.plate_number,
                t.model,
                t.latitude,
                t.longitude
             FROM route_assignments ra
             JOIN routes r ON ra.route_id = r.id
             JOIN trucks t ON ra.truck_id = t.id
             WHERE ra.driver_id = ? AND ra.assigned_date = ?
             LIMIT 1`,
            [req.user.id, today]
        );

        const assignment = assignments[0] || null;
        console.log("Found assignment:", assignment ? `YES (${assignment.zone_name})` : "NO");

        res.json(assignment);
    } catch (err) {
        console.error("Error in getTodayAssignment:", err);
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
             JOIN trucks t ON ra.truck_id = t.id
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
        const { latitude, longitude, accuracy } = req.body;
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "latitude and longitude required" });
        }

        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

        const [[assignment]] = await db.query(
            `SELECT truck_id FROM route_assignments
             WHERE driver_id=? AND assigned_date=? LIMIT 1`,
            [req.user.id, today]
        );

        if (!assignment) {
            return res.status(404).json({ error: "No truck assigned today" });
        }

        // Update truck location
        await db.query(
            "UPDATE trucks SET latitude=?, longitude=?, last_location_update=NOW() WHERE id=?",
            [latitude, longitude, assignment.truck_id]
        );

        // Log the location
        await db.query(
            `INSERT INTO trip_logs (assignment_id, latitude, longitude, logged_at)
             SELECT ra.id, ?, ?, NOW()
             FROM route_assignments ra
             WHERE ra.driver_id = ? AND ra.assigned_date = ?
             LIMIT 1`,
            [latitude, longitude, req.user.id, today]
        );

        res.json({ message: "Location updated", accuracy: accuracy });
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
        const [rows] = await db.query(
            `SELECT a.id, a.title, a.message, a.created_at, u.name as admin_name
             FROM announcements a
             LEFT JOIN users u ON a.created_by = u.id
             ORDER BY a.created_at DESC
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
             JOIN routes r ON ra.route_id = r.id
             JOIN trucks t ON ra.truck_id = t.id
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
            "SELECT id, name, email, phone, address, role FROM users WHERE id=?",
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

exports.getRouteWaypoints = async (req, res) => {
    try {
        const { route_id } = req.query;

        console.log("getRouteWaypoints called with route_id:", route_id);

        if (!route_id) {
            return res.status(400).json({ error: "route_id is required" });
        }

        const [routes] = await db.query(
            `SELECT id, zone_name, description, waypoints_json 
             FROM routes 
             WHERE id = ?`,
            [route_id]
        );

        if (!routes.length) {
            return res.status(404).json({ error: "Route not found" });
        }

        const route = routes[0];
        console.log("Found route:", route.zone_name);
        console.log("Raw waypoints_json type:", typeof route.waypoints_json);
        console.log("Raw waypoints_json value:", route.waypoints_json);

        let waypoints = [];
        let parsedWaypoints = null;

        if (route.waypoints_json) {
            try {
                let parsed = route.waypoints_json;
                if (typeof parsed === 'string') {
                    parsed = JSON.parse(parsed);
                }

                console.log("Parsed waypoints structure:", JSON.stringify(parsed, null, 2));

                // Check for different formats
                if (parsed && typeof parsed === 'object') {
                    if (parsed.road || parsed.road_path) {
                        console.log("Found road layer with", (parsed.road || parsed.road_path).length, "points");
                    }
                    if (parsed.pins || parsed.pin_stops) {
                        console.log("Found pins layer with", (parsed.pins || parsed.pin_stops).length, "points");
                    }
                    if (parsed.mrf || parsed.mrf_stops) {
                        console.log("Found MRF layer with", (parsed.mrf || parsed.mrf_stops).length, "points");
                    }
                }

                parsedWaypoints = parsed;

                // Return the full parsed structure
                return res.json({
                    waypoints: [],
                    raw_waypoints: parsedWaypoints,
                    waypoints_json: route.waypoints_json,
                    zone_name: route.zone_name,
                    description: route.description,
                    has_waypoints: true
                });
            } catch (e) {
                console.error("Error parsing waypoints:", e);
            }
        }

        res.json({
            waypoints: waypoints,
            raw_waypoints: null,
            zone_name: route.zone_name,
            description: route.description,
            has_waypoints: false
        });
    } catch (err) {
        console.error("Error in getRouteWaypoints:", err);
        res.status(500).json({ error: err.message });
    }
};