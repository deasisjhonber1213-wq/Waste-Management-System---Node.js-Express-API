const db = require("../config/db");
// NOTE: adjust this import if your login/auth code hashes passwords with a
// different library — this file assumes the same `bcryptjs` used elsewhere.
const bcrypt = require("bcryptjs");


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

// A truck is only "really" trackable once the driver has pressed Start Route
// (route_assignments.status === 'in_progress') AND has a GPS ping within the
// last few minutes. Otherwise we were previously showing the truck's static
// depot coordinates as if it were live, which is the bug being fixed here.
const LIVE_LOCATION_FRESHNESS_MS = 3 * 60 * 1000;

exports.getTodayTruck = async (req, res) => {
    try {
        const [assignment] = await db.query(`
            SELECT ra.*, t.plate_number, t.model,
                   r.id as route_id, r.zone_name, r.waypoints_json
            FROM route_assignments ra
            JOIN trucks t ON ra.truck_id = t.id
            JOIN routes r ON ra.route_id = r.id
            WHERE ra.assigned_date = CURDATE()
            LIMIT 1
        `);

        if (!assignment[0]) {
            return res.json(null);
        }

        const route = assignment[0];
        route.parsed_waypoints = route.waypoints_json
            ? parseWaypoints(route.waypoints_json)
            : { road: [], pins: [], mrfs: [] };

        route.route_started = route.status === "in_progress";
        route.has_live_location = false;
        route.latitude = null;
        route.longitude = null;

        if (route.route_started) {
            const [logs] = await db.query(
                `SELECT latitude, longitude, recorded_at FROM gps_logs
                 WHERE truck_id = ? ORDER BY recorded_at DESC LIMIT 1`,
                [route.truck_id]
            ).catch(() => [[]]);

            const latest = logs && logs[0];
            const isFresh = latest &&
                (Date.now() - new Date(latest.recorded_at).getTime()) < LIVE_LOCATION_FRESHNESS_MS;

            if (isFresh) {
                route.has_live_location = true;
                route.latitude = latest.latitude;
                route.longitude = latest.longitude;
            }
        }

        res.json(route);
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
        const truckId = req.params.truckId;

        // Don't return any location data (fresh or stale) unless today's
        // assignment for this truck has actually been started by the driver.
        const [assignment] = await db.query(
            `SELECT status FROM route_assignments
             WHERE truck_id = ? AND assigned_date = CURDATE() LIMIT 1`,
            [truckId]
        );
        if (!assignment[0] || assignment[0].status !== "in_progress") {
            return res.json([]);
        }

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
        `, [truckId]);

        // Only trust pings from the last few minutes — an old parked/last-known
        // ping shouldn't make the truck look live on the resident's map.
        const fresh = logs.filter(l =>
            (Date.now() - new Date(l.recorded_at).getTime()) < LIVE_LOCATION_FRESHNESS_MS
        );

        res.json(fresh);
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

        // The old 5MB base64 cap here (and the 2MB cap on the frontend) was
        // rejecting normal phone camera photos. The frontend now downsizes /
        // compresses images before upload instead of hard-blocking them, so
        // this size check has been removed.
        // If uploads still fail, raise the JSON body limit on the Express app
        // itself, e.g. in your server entrypoint:
        //   app.use(express.json({ limit: '15mb' }));

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
        const [rows] = await db.query(
            `SELECT value FROM app_settings WHERE \`key\` = 'mrf_location' LIMIT 1`
        ).catch(() => [[]]);

        const mrf = rows && rows[0];

        if (mrf) {
            return res.json(JSON.parse(mrf.value));
        }

        // No hardcoded fallback anymore — if the MRF hasn't been configured
        // in app_settings, tell the frontend there simply isn't one to show.
        res.json(null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ---------------------------------------------------------------------
// Profile / account management
// ---------------------------------------------------------------------

exports.getProfile = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, name, email, phone, role FROM users WHERE id = ?`,
            [req.user.id]
        );
        const user = rows && rows[0];
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { name, phone } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Name is required" });
        }

        await db.query(
            `UPDATE users SET name = ?, phone = ? WHERE id = ?`,
            [name.trim(), phone ? phone.trim() : null, req.user.id]
        );

        res.json({ message: "Profile updated" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ error: "current_password and new_password are required" });
        }
        if (new_password.length < 8) {
            return res.status(400).json({ error: "New password must be at least 8 characters" });
        }

        const [rows] = await db.query(
            `SELECT password FROM users WHERE id = ?`,
            [req.user.id]
        );
        const user = rows && rows[0];
        if (!user) return res.status(404).json({ error: "User not found" });

        const matches = await bcrypt.compare(current_password, user.password);
        if (!matches) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        const hashed = await bcrypt.hash(new_password, 10);
        await db.query(`UPDATE users SET password = ? WHERE id = ?`, [hashed, req.user.id]);

        res.json({ message: "Password changed successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};