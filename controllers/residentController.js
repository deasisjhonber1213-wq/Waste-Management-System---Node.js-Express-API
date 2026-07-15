const db = require("../config/db");


function parseWaypoints(raw) {
    if (!raw) return { road: [], pins: [], mrfs: [] };
    try {
        let data = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(data)) {
            return {
                road: [],
                pins: data.map((wp, i) => ({
                    lat: parseFloat(wp.lat),
                    lng: parseFloat(wp.lng),
                    name: wp.name || `Stop ${i + 1}`,
                    num: wp.stopNumber || (i + 1)
                })),
                mrfs: []
            };
        }
        const road = (data.road_path || data.road || []).map(v => ({
            lat: parseFloat(v.lat),
            lng: parseFloat(v.lng)
        }));
        const pins = (data.pin_stops || data.pins || []).map((p, i) => ({
            lat: parseFloat(p.lat),
            lng: parseFloat(p.lng),
            name: p.name || `Stop ${i + 1}`,
            num: p.stopNumber || (i + 1)
        }));
        const mrfs = (data.mrf_stops || data.mrf || []).map(m => ({
            lat: parseFloat(m.lat),
            lng: parseFloat(m.lng),
            name: m.name || "MRF Stop"
        }));
        return { road, pins, mrfs };
    } catch (e) {
        console.error("parseWaypoints error:", e);
        return { road: [], pins: [], mrfs: [] };
    }
}


exports.getTodayTruck = async (req, res) => {
    try {
        const [assignment] = await db.query(`
            SELECT ra.*, t.plate_number, t.model, t.latitude, t.longitude,
                   r.id as route_id, r.zone_name, r.waypoints_json
            FROM route_assignments ra
            JOIN trucks t ON ra.truck_id = t.id
            JOIN routes r ON ra.route_id = r.id
            WHERE ra.assigned_date = CURDATE()
            LIMIT 1
        `);

        if (assignment[0] && assignment[0].waypoints_json) {
            const route = assignment[0];
            route.parsed_waypoints = parseWaypoints(route.waypoints_json);
        }
        res.json(assignment[0] || null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.getRouteWaypoints = async (req, res) => {
    try {
        const { route_id } = req.query;
        if (!route_id) {
            return res.status(400).json({ error: "route_id required" });
        }

        const [routes] = await db.query(
            `SELECT id, zone_name, description, waypoints_json
             FROM routes WHERE id = ?`,
            [route_id]
        );

        if (!routes.length) {
            return res.status(404).json({ error: "Route not found" });
        }

        const route = routes[0];
        let parsedWaypoints = null;
        if (route.waypoints_json) {
            try {
                parsedWaypoints = typeof route.waypoints_json === 'string'
                    ? JSON.parse(route.waypoints_json)
                    : route.waypoints_json;
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
        console.error("getRouteWaypoints error:", err);
        res.status(500).json({ error: err.message });
    }
};


exports.getPickupSchedule = async (req, res) => {
    try {
        const [schedule] = await db.query(`
            SELECT ra.assigned_date, t.plate_number, r.zone_name,
                   ra.status, ra.pickup_type
            FROM route_assignments ra
            JOIN trucks t ON ra.truck_id = t.id
            JOIN routes r ON ra.route_id = r.id
            ORDER BY ra.assigned_date DESC
        `);
        res.json(schedule);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.getTruckLocation = async (req, res) => {
    try {
        const [tables] = await db.query(
            "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'gps_logs'"
        );

        if (tables[0].count === 0) {
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
        res.json([]);
    }
};


exports.createReport = async (req, res) => {
    try {
        const { type, description, latitude, longitude, image_url } = req.body;

        if (!type) return res.status(400).json({ error: "Type required" });
        if (!description) return res.status(400).json({ error: "Description required" });
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "Location required" });
        }
        if (!image_url) {
            return res.status(400).json({ error: "Image required" });
        }

        if (image_url && image_url.length > 5 * 1024 * 1024) {
            return res.status(400).json({ error: "Image too large" });
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


exports.shareMyLocation = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "latitude and longitude required" });
        }

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

exports.getMRFLocation = async (req, res) => {
    try {
        const [[mrf]] = await db.query(
            `SELECT value FROM app_settings WHERE key = 'mrf_location' LIMIT 1`
        ).catch(() => [[null]]);

        if (mrf) {
            return res.json(JSON.parse(mrf.value));
        }

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