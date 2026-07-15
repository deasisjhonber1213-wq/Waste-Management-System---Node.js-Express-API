
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
        // First check if gps_logs table exists
        const [tables] = await db.query(
            "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'gps_logs'"
        );

        if (tables[0].count === 0) {
            // Table doesn't exist, return empty array
            return res.json([]);
        }

        const [logs] = await db.query(`
            SELECT latitude, longitude, recorded_at 
            FROM gps_logs 
            WHERE truck_id = ? 
            ORDER BY recorded_at DESC LIMIT 50
        `, [req.params.truckId]);

        res.json(logs);
    } catch (err) {
        console.error(err);
        // Return empty array instead of error to prevent UI issues
        res.json([]);
    }
};


exports.createReport = async (req, res) => {
    try {
        const { type, description, latitude, longitude, image_url } = req.body;

        // Validate required fields
        if (!type) return res.status(400).json({ error: "Type is required" });
        if (!description) return res.status(400).json({ error: "Description is required" });
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "Location is required" });
        }
        if (!image_url) {
            return res.status(400).json({ error: "Image is required" });
        }

        // Optional: Validate base64 image size
        if (image_url && image_url.length > 5 * 1024 * 1024) {
            return res.status(400).json({ error: "Image is too large" });
        }

        await db.query(`
            INSERT INTO reports (resident_id, type, description, latitude, longitude, image_url)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [req.user.id, type, description, latitude, longitude, image_url]);

        res.json({ message: "Report submitted successfully" });
    } catch (err) {
        console.error("Create report error:", err);
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

// Share resident location (so driver can see it)
exports.shareMyLocation = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "latitude and longitude required" });
        }

        // Upsert resident location into a dedicated table or reuse users table
        await db.query(
            `UPDATE users SET latitude = ?, longitude = ?, location_updated_at = NOW() WHERE id = ?`,
            [latitude, longitude, req.user.id]
        );

        res.json({ message: "Location shared", latitude, longitude });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// Get all residents who have shared their location (for driver view)
// Also used by residents to see themselves on map
exports.getResidentLocations = async (req, res) => {
    try {
        const [residents] = await db.query(
            `SELECT id, name, latitude, longitude, location_updated_at
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

// Get MRF (Material Recovery Facility) location — stored as a config or single row
exports.getMRFLocation = async (req, res) => {
    try {
        // Option A: you have a settings/config table
        const [[mrf]] = await db.query(
            `SELECT value FROM app_settings WHERE key = 'mrf_location' LIMIT 1`
        ).catch(() => [[null]]);

        if (mrf) {
            return res.json(JSON.parse(mrf.value));
        }

        // Option B: fallback hardcoded coordinates for Jose Dalman MRF
        res.json({
            name: "Jose Dalman MRF",
            latitude: 8.2317,
            longitude: 123.4018
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
// Add this function to your residentController.js file
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

        // Parse waypoints to ensure proper format
        let parsedWaypoints = null;
        if (route.waypoints_json) {
            try {
                parsedWaypoints = typeof route.waypoints_json === 'string'
                    ? JSON.parse(route.waypoints_json)
                    : route.waypoints_json;
                console.log("Waypoints parsed successfully:", !!parsedWaypoints);
            } catch (e) {
                console.error("Error parsing waypoints:", e);
            }
        }

        res.json({
            waypoints_json: route.waypoints_json,
            raw_waypoints: parsedWaypoints,
            zone_name: route.zone_name,
            description: route.description,
            has_waypoints: !!parsedWaypoints
        });
    } catch (err) {
        console.error("Error in getRouteWaypoints:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getTodayTruck = async (req, res) => {
    try {
        const [assignment] = await db.query(`
            SELECT ra.*, t.plate_number, t.model, t.latitude, t.longitude, 
                   r.zone_name, r.id as route_id, r.waypoints_json
            FROM route_assignments ra
            JOIN trucks t ON ra.truck_id = t.id
            JOIN routes r ON ra.route_id = r.id
            WHERE ra.assigned_date = CURDATE()
            LIMIT 1
        `);

        if (assignment[0]) {
            // Parse waypoints to include in response
            const route = assignment[0];
            if (route.waypoints_json) {
                try {
                    route.parsed_waypoints = typeof route.waypoints_json === 'string'
                        ? JSON.parse(route.waypoints_json)
                        : route.waypoints_json;
                } catch (e) {
                    console.error("Error parsing waypoints:", e);
                }
            }
        }

        res.json(assignment[0] || null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
