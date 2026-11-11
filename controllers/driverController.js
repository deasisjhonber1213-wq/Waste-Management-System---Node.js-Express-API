const db = require("../config/db");
const { deduplicateAssignments } = require("../utils/routeAssignments");

// ─────────────────────────────────────────────────────────
// HELPER: Get today's date in Asia/Manila timezone
// ─────────────────────────────────────────────────────────
function manilaToday() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function parseProgressLog(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
        console.error("Invalid route progress log:", err);
        return {};
    }
}

// ─────────────────────────────────────────────────────────
// AUTO-CANCEL MISSED ASSIGNMENTS
// Any assignment whose scheduled date has already passed and
// which never got started (still 'pending') or was left hanging
// mid-route ('in_progress') is flipped to 'cancelled'. This runs
// on the main read endpoints the driver portal hits on load, so
// admins never have to manually clean up stale pending rows and
// they don't linger forever on the dashboard/reports.
// ─────────────────────────────────────────────────────────
async function autoCancelMissedAssignments() {
    try {
        const today = manilaToday();
        const [result] = await db.query(
            `UPDATE route_assignments
             SET status = 'cancelled'
             WHERE assigned_date < ?
               AND status IN ('pending', 'in_progress')`,
            [today]
        );
        if (result && result.affectedRows) {
            console.log(`🕑 Auto-cancelled ${result.affectedRows} missed/never-started assignment(s) before ${today}`);
        }
    } catch (err) {
        // Never let this block the actual request — just log it.
        console.error("autoCancelMissedAssignments error:", err);
    }
}
exports.autoCancelMissedAssignments = autoCancelMissedAssignments;

exports.getTodayAssignment = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: "User not authenticated" });
        }
        await autoCancelMissedAssignments();
        const today = manilaToday();

        const [assignments] = await db.query(
            `SELECT
                ra.id, ra.driver_id, ra.assigned_date, ra.status, ra.pickup_type, ra.progress_log,
                r.id as route_id, r.zone_name, r.description AS zone_description,
                ra.truck_id, t.plate_number, t.model, t.latitude, t.longitude
             FROM route_assignments ra
             JOIN routes r ON ra.route_id = r.id
             JOIN trucks t ON ra.truck_id = t.id
             WHERE ra.driver_id = ? AND ra.assigned_date = ?
             ORDER BY ra.id ASC`,
            [req.user.id, today]
        );

        res.json(deduplicateAssignments(assignments).map(assignment => ({
            ...assignment,
            progress_log: parseProgressLog(assignment.progress_log)
        })));
    } catch (err) {
        console.error("Error in getTodayAssignment:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateAssignmentStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ["pending", "in_progress", "completed", "cancelled"];
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

        if (req.app.get('io')) {
            const io = req.app.get('io');
            io.to(`driver-${req.user.id}`).emit('assignment-status-changed', {
                assignmentId: req.params.id,
                status: status,
                timestamp: new Date()
            });

            // Broadcast to all residents so they can see the status change
            io.emit('assignment-public-status', {
                assignmentId: req.params.id,
                status: status,
                driverId: req.user.id,
                timestamp: new Date()
            });
        }

        res.json({ message: `Status updated to ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getMySchedule = async (req, res) => {
    try {
        await autoCancelMissedAssignments();

        const [rows] = await db.query(
            `SELECT
                ra.id,
                ra.driver_id,
                ra.route_id,
                ra.truck_id,
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
        res.json(deduplicateAssignments(rows));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateMyLocation = async (req, res) => {
    try {
        const { latitude, longitude, accuracy, assignment_id } = req.body;
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "latitude and longitude required" });
        }

        const today = manilaToday();
        let assignment;

        if (assignment_id) {
            [[assignment]] = await db.query(
                `SELECT id, truck_id FROM route_assignments
                 WHERE id=? AND driver_id=? AND assigned_date=?`,
                [assignment_id, req.user.id, today]
            );
        } else {
            [[assignment]] = await db.query(
                `SELECT id, truck_id FROM route_assignments
                 WHERE driver_id=? AND assigned_date=?
                 ORDER BY FIELD(status,'in_progress','pending','completed','cancelled'), id ASC
                 LIMIT 1`,
                [req.user.id, today]
            );
        }

        if (!assignment) {
            return res.status(404).json({ error: "No matching assignment today" });
        }

        await db.query(
            "UPDATE trucks SET latitude=?, longitude=?, location_updated_at=NOW() WHERE id=?",
            [latitude, longitude, assignment.truck_id]
        );

        await db.query(
            `INSERT INTO trip_logs (assignment_id, latitude, longitude, logged_at)
             VALUES (?, ?, ?, NOW())`,
            [assignment.id, latitude, longitude]
        );

        if (req.app.get('io')) {
            const io = req.app.get('io');
            io.to(`dispatcher-${req.user.id}`).emit('driver-moved', {
                driverId: req.user.id, assignmentId: assignment.id,
                latitude, longitude, accuracy: accuracy || 0, timestamp: Date.now()
            });
            io.emit('truck-location', {
                truckId: assignment.truck_id,
                assignmentId: assignment.id,
                latitude, longitude,
                accuracy: accuracy || 0, timestamp: Date.now()
            });
        }

        res.json({ message: "Location updated", accuracy });
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
            `INSERT INTO reports (resident_id, type, description, location_note, status, created_at)
             VALUES (?, ?, ?, ?, 'pending', NOW())`,
            [req.user.id, type, description, location_note || null]
        );

        if (req.app.get('io')) {
            const io = req.app.get('io');
            io.to(`driver-${req.user.id}`).emit('report-submitted', {
                success: true,
                message: 'Report submitted successfully'
            });
        }

        res.json({ message: "Report submitted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getMyReports = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, type, description, location_note, status, created_at
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
                ra.id AS assignment_id,
                COALESCE(
                    (SELECT MAX(COALESCE(tl.completed_at, tl.end_time))
                     FROM trip_logs tl
                     WHERE tl.assignment_id = ra.id
                       AND (tl.completed_at IS NOT NULL OR tl.end_time IS NOT NULL)),
                    ra.assigned_date
                ) AS completed_at,
                ra.assigned_date,
                ra.pickup_type,
                ra.status,
                r.zone_name,
                t.plate_number
             FROM route_assignments ra
             JOIN routes r ON ra.route_id = r.id
             JOIN trucks t ON ra.truck_id = t.id
             WHERE ra.driver_id = ?
               AND ra.status IN ('completed', 'cancelled')
             ORDER BY COALESCE(
                 (SELECT MAX(COALESCE(tl.completed_at, tl.end_time))
                  FROM trip_logs tl
                  WHERE tl.assignment_id = ra.id
                    AND (tl.completed_at IS NOT NULL OR tl.end_time IS NOT NULL)),
                 ra.assigned_date
             ) DESC
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

        if (req.app.get('io')) {
            const io = req.app.get('io');
            io.to(`driver-${req.user.id}`).emit('profile-updated', {
                success: true,
                message: 'Profile updated successfully'
            });
        }

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

exports.getStats = async (req, res) => {
    try {
        const [stats] = await db.query(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM route_assignments
            WHERE driver_id = ?`,
            [req.user.id]
        );
        res.json(stats[0] || { total: 0, completed: 0, pending: 0, in_progress: 0, cancelled: 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getTodayRouteDetails = async (req, res) => {
    try {
        await autoCancelMissedAssignments();
        const today = manilaToday();

        const [assignments] = await db.query(
            `SELECT
                ra.id, ra.assigned_date, ra.status, ra.pickup_type, ra.progress_log,
                r.id as route_id, r.zone_name, r.description AS zone_description, r.waypoints_json,
                t.id AS truck_id, t.plate_number, t.model, t.latitude, t.longitude
             FROM route_assignments ra
             JOIN routes r ON ra.route_id = r.id
             JOIN trucks t ON ra.truck_id = t.id
             WHERE ra.driver_id = ? AND ra.assigned_date = ?
             ORDER BY ra.id ASC`,
            [req.user.id, today]
        );

        const result = assignments.map(a => {
            if (a.waypoints_json) {
                try {
                    a.waypoints = typeof a.waypoints_json === 'string'
                        ? JSON.parse(a.waypoints_json) : a.waypoints_json;
                } catch (e) { a.waypoints = null; }
            } else {
                a.waypoints = null;
            }
            a.progress_log = parseProgressLog(a.progress_log);
            delete a.waypoints_json;
            return a;
        });

        res.json(result); // array
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getLocationHistory = async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const today = manilaToday();

        const [rows] = await db.query(
            `SELECT 
                tl.latitude,
                tl.longitude,
                tl.logged_at as timestamp,
                ra.zone_name
             FROM trip_logs tl
             JOIN route_assignments ra ON tl.assignment_id = ra.id
             WHERE ra.driver_id = ? AND ra.assigned_date = ?
             ORDER BY tl.logged_at DESC
             LIMIT ?`,
            [req.user.id, today, parseInt(limit)]
        );

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateRouteProgress = async (req, res) => {
    try {
        const { assignment_id, stop_index, stop_status } = req.body;

        if (!Number.isSafeInteger(Number(assignment_id)) || Number(assignment_id) <= 0 ||
            !Number.isSafeInteger(stop_index) || stop_index < 0 ||
            !['collected', 'missed', 'inaccessible'].includes(stop_status)) {
            return res.status(400).json({ error: "assignment_id and stop_index required" });
        }

        const [[assignment]] = await db.query(
            `SELECT ra.id, r.waypoints_json
             FROM route_assignments ra
             JOIN routes r ON r.id = ra.route_id
             WHERE ra.id = ? AND ra.driver_id = ?
               AND ra.assigned_date = ? AND ra.status = 'in_progress'`,
            [Number(assignment_id), req.user.id, manilaToday()]
        );

        if (!assignment) {
            return res.status(403).json({ error: "Not authorised" });
        }

        let waypoints = assignment.waypoints_json;
        try {
            waypoints = typeof waypoints === 'string' ? JSON.parse(waypoints) : waypoints;
        } catch (err) {
            return res.status(409).json({ error: "Route stops could not be loaded" });
        }
        const stops = Array.isArray(waypoints)
            ? waypoints
            : waypoints?.pin_stops || waypoints?.pins || [];
        if (!Array.isArray(stops) || stop_index >= stops.length) {
            return res.status(400).json({ error: "Stop index is outside this route" });
        }

        await db.query(
            `UPDATE route_assignments 
             SET progress_log = JSON_SET(
                 COALESCE(progress_log, '{}'), 
                 CONCAT('$.stop_', ?), 
                 ?
             )
             WHERE id = ?`,
            [stop_index, stop_status, Number(assignment_id)]
        );

        if (req.app.get('io')) {
            const io = req.app.get('io');
            io.to(`driver-${req.user.id}`).emit('stop-updated', {
                assignmentId: Number(assignment_id),
                stopIndex: stop_index,
                status: stop_status,
                timestamp: new Date()
            });
            io.emit('assignment-stop-status', {
                assignmentId: Number(assignment_id),
                stopIndex: stop_index,
                status: stop_status,
                timestamp: new Date()
            });
        }

        res.json({
            message: `Stop ${stop_index + 1} updated to ${stop_status}`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getResidentLocations = async (req, res) => {
    try {
        const [assignments] = await db.query(
            `SELECT id
             FROM route_assignments ra
             WHERE ra.driver_id = ? AND ra.assigned_date = ?
               AND ra.status <> 'cancelled'
             LIMIT 1`,
            [req.user.id, manilaToday()]
        );
        if (!assignments.length) return res.json([]);

        const [residents] = await db.query(
            `SELECT id, name, latitude, longitude, location_updated_at
             FROM users
             WHERE role = 'resident'
               AND latitude IS NOT NULL AND longitude IS NOT NULL
               AND location_updated_at >= NOW() - INTERVAL 2 HOUR
             ORDER BY location_updated_at DESC`
        );
        res.json(residents);
    } catch (err) {
        console.error("Driver resident-location lookup failed:", err);
        res.status(500).json({ error: "Could not load shared resident locations" });
    }
};

exports.getConnectedDrivers = async (req, res) => {
    try {
        const connectedDrivers = req.app.get('connectedDrivers') || new Map();

        const online = Array.from(connectedDrivers.entries()).map(([id, data]) => ({
            id,
            name: data.name,
            lastLat: data.lastLat,
            lastLng: data.lastLng,
            connectedAt: data.connectedAt,
            lastUpdate: data.lastUpdate,
            socketId: data.socketId
        }));

        res.json(online);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.createQuickReport = async (req, res) => {
    try {
        const { type, description, location_note, latitude, longitude, image_url } = req.body;

        if (!type || !description) {
            return res.status(400).json({ error: "Type and description required" });
        }

        const result = await db.query(
            `INSERT INTO reports (
                resident_id, 
                type, 
                description, 
                location_note, 
                latitude, 
                longitude, 
                image_url,
                status,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
            [
                req.user.id,
                type,
                description,
                location_note || null,
                latitude || null,
                longitude || null,
                image_url || null
            ]
        );

        if (req.app.get('io')) {
            const io = req.app.get('io');
            io.to(`dispatcher-${req.user.id}`).emit('new-report', {
                reportId: result[0].insertId,
                driverId: req.user.id,
                type: type,
                description: description,
                location: { latitude, longitude },
                timestamp: new Date()
            });
        }

        res.json({
            message: "Report submitted successfully",
            reportId: result[0].insertId
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT 
                id, 
                message, 
                type, 
                is_read,
                created_at,
                related_id
             FROM notifications 
             WHERE user_id = ? AND user_type = 'driver'
             ORDER BY created_at DESC
             LIMIT 50`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.markNotificationRead = async (req, res) => {
    try {
        const { notification_id } = req.params;

        await db.query(
            "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
            [notification_id, req.user.id]
        );

        res.json({ message: "Notification marked as read" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getPerformanceStats = async (req, res) => {
    try {
        const today = manilaToday();
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

        const [weekly] = await db.query(
            `SELECT 
                COUNT(*) as total_assigned,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                ROUND(
                    (SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 1
                ) as completion_rate
            FROM route_assignments
            WHERE driver_id = ? 
            AND assigned_date BETWEEN ? AND ?`,
            [req.user.id, weekAgoStr, today]
        );

        const [todayStats] = await db.query(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM route_assignments
            WHERE driver_id = ? AND assigned_date = ?`,
            [req.user.id, today]
        );

        res.json({
            weekly: weekly[0] || { total_assigned: 0, completed: 0, pending: 0, cancelled: 0, completion_rate: 0 },
            today: todayStats[0] || { total: 0, completed: 0 },
            connected_vehicles: 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getOpenReports = async (req, res) => {
    try {
        const [reports] = await db.query(
            `SELECT 
                r.id,
                r.type,
                r.description,
                r.latitude,
                r.longitude,
                r.image_url,
                r.location_note,
                r.created_at,
                r.status,
                r.resident_id AS user_id,
                u.name AS resident_name
             FROM reports r
             LEFT JOIN users u ON r.resident_id = u.id
             WHERE r.latitude IS NOT NULL 
               AND r.longitude IS NOT NULL
               AND (r.status IS NULL OR r.status IN ('pending', 'in_progress'))
             ORDER BY r.created_at DESC
             LIMIT 100`
        );

        res.json(reports);
    } catch (err) {
        console.error('getOpenReports error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateReportStatus = async (req, res) => {
    try {
        if (req.user?.role !== 'driver') {
            return res.status(403).json({ error: 'Driver access required' });
        }
        const { id } = req.params;
        const { status } = req.body;

        let nextStatus = status;
        if (status === 'completed') {
            nextStatus = 'resolved';
        }

        const allowed = ['pending', 'in_progress', 'resolved', 'rejected'];
        if (!allowed.includes(nextStatus)) {
            return res.status(400).json({
                error: `Invalid status: ${nextStatus}. Allowed: ${allowed.join(', ')}`
            });
        }

        const [existing] = await db.query(
            `SELECT id, status FROM reports WHERE id = ?`,
            [id]
        );

        if (!existing.length) {
            return res.status(404).json({ error: 'Report not found' });
        }

        await db.query(
            `UPDATE reports 
             SET status = ?, 
                 updated_at = NOW(),
                 resolved_by = ? 
             WHERE id = ?`,
            [nextStatus, req.user.id, id]
        );

        if (req.app.get('io')) {
            const io = req.app.get('io');
            io.emit('report-status-changed', {
                reportId: Number(id),
                status: nextStatus,
                resolvedBy: req.user.id
            });
        }

        res.json({
            message: `Report marked as ${nextStatus}`,
            status: nextStatus
        });
    } catch (err) {
        console.error('updateReportStatus error:', err);
        res.status(500).json({ error: err.message });
    }
};