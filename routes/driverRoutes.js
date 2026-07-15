const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const driverController = require('../controllers/driverController');

router.get('/today', auth, driverController.getTodayAssignment);
router.get('/today/details', auth, driverController.getTodayRouteDetails);
router.patch('/assignment/:id/status', auth, driverController.updateAssignmentStatus);
router.patch('/assignment/:id/progress', auth, driverController.updateRouteProgress);
router.get('/schedule', auth, driverController.getMySchedule);
router.post('/location', auth, driverController.updateMyLocation);
router.get('/location/history', auth, driverController.getLocationHistory);
router.post('/reports', auth, driverController.submitReport);
router.post('/reports/quick', auth, driverController.createQuickReport);
router.get('/reports', auth, driverController.getMyReports);
router.get('/announcements', auth, driverController.getAnnouncements);
router.get('/trips', auth, driverController.getTripHistory);
router.get('/profile', auth, driverController.getProfile);
router.put('/profile', auth, driverController.updateProfile);
router.get('/stats', auth, driverController.getStats);
router.get('/stats/performance', auth, driverController.getPerformanceStats);
router.get('/route-waypoints', auth, driverController.getRouteWaypoints);
router.get('/notifications', auth, driverController.getNotifications);
router.patch('/notifications/:notification_id/read', auth, driverController.markNotificationRead);
router.get('/online', auth, driverController.getConnectedDrivers);

module.exports = router;