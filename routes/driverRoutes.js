const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const driverController = require('../controllers/driverController');

// =============================================
// TODAY'S ROUTE
// =============================================
router.get('/today', auth, driverController.getTodayAssignment);
router.get('/today/details', auth, driverController.getTodayRouteDetails);

// =============================================
// ASSIGNMENT MANAGEMENT
// =============================================
router.patch('/assignment/:id/status', auth, driverController.updateAssignmentStatus);
router.patch('/assignment/:id/progress', auth, driverController.updateRouteProgress);

// =============================================
// SCHEDULE
// =============================================
router.get('/schedule', auth, driverController.getMySchedule);

// =============================================
// LOCATION TRACKING
// =============================================
router.post('/location', auth, driverController.updateMyLocation);
router.get('/location/history', auth, driverController.getLocationHistory);

// =============================================
// REPORTS
// =============================================
router.post('/reports', auth, driverController.submitReport);
router.post('/reports/quick', auth, driverController.createQuickReport);
router.get('/reports', auth, driverController.getMyReports);

// =============================================
// ANNOUNCEMENTS
// =============================================
router.get('/announcements', auth, driverController.getAnnouncements);

// =============================================
// TRIP HISTORY
// =============================================
router.get('/trips', auth, driverController.getTripHistory);

// =============================================
// PROFILE
// =============================================
router.get('/profile', auth, driverController.getProfile);
router.put('/profile', auth, driverController.updateProfile);

// =============================================
// STATS & PERFORMANCE
// =============================================
router.get('/stats', auth, driverController.getStats);
router.get('/stats/performance', auth, driverController.getPerformanceStats);

// =============================================
// ROUTE WAYPOINTS
// =============================================
router.get('/route-waypoints', auth, driverController.getRouteWaypoints);

// =============================================
// NOTIFICATIONS
// =============================================
router.get('/notifications', auth, driverController.getNotifications);
router.patch('/notifications/:notification_id/read', auth, driverController.markNotificationRead);

// =============================================
// DRIVER STATUS (Admin/Dispatcher)
// =============================================
router.get('/online', auth, driverController.getConnectedDrivers);

module.exports = router;