const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const driverController = require('../controllers/driverController');

router.get('/today', auth.protect, driverController.getTodayAssignment);
router.get('/today/details', auth.protect, driverController.getTodayRouteDetails);
router.patch('/assignment/:id/status', auth.protect, driverController.updateAssignmentStatus);
router.patch('/assignment/:id/progress', auth.protect, driverController.updateRouteProgress);
router.get('/schedule', auth.protect, driverController.getMySchedule);
router.post('/location', auth.protect, driverController.updateMyLocation);
router.get('/location/history', auth.protect, driverController.getLocationHistory);
router.post('/reports', auth.protect, driverController.submitReport);
router.post('/reports/quick', auth.protect, driverController.createQuickReport);
router.get('/reports', auth.protect, driverController.getMyReports);
router.get('/announcements', auth.protect, driverController.getAnnouncements);
router.get('/trips', auth.protect, driverController.getTripHistory);
router.get('/profile', auth.protect, driverController.getProfile);
router.put('/profile', auth.protect, driverController.updateProfile);
router.get('/stats', auth.protect, driverController.getStats);
router.get('/stats/performance', auth.protect, driverController.getPerformanceStats);
router.get('/route-waypoints', auth.protect, driverController.getRouteWaypoints);
router.get('/notifications', auth.protect, driverController.getNotifications);
router.patch('/notifications/:notification_id/read', auth.protect, driverController.markNotificationRead);
router.get('/online', auth.protect, driverController.getConnectedDrivers);
router.get('/reports/open', auth.protect, driverController.getOpenReports);
router.patch('/reports/:id/status', auth.protect, driverController.updateReportStatus);

module.exports = router;