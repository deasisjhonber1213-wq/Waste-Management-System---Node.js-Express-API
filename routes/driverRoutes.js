const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const driverController = require('../controllers/driverController');

router.use(auth.protect, auth.driverOnly);

router.get('/today', driverController.getTodayAssignment);
router.get('/today/details', driverController.getTodayRouteDetails);
router.patch('/assignment/:id/status', driverController.updateAssignmentStatus);
router.patch('/assignment/:id/progress', driverController.updateRouteProgress);
router.get('/schedule', driverController.getMySchedule);
router.post('/location', driverController.updateMyLocation);
router.get('/location/history', driverController.getLocationHistory);

router.get('/reports/open', driverController.getOpenReports);
router.patch('/reports/:id/status', driverController.updateReportStatus);
router.get('/reports', driverController.getMyReports);
router.post('/reports', driverController.submitReport);
router.post('/reports/quick', driverController.createQuickReport);

router.get('/announcements', driverController.getAnnouncements);
router.get('/trips', driverController.getTripHistory);
router.get('/profile', driverController.getProfile);
router.put('/profile', driverController.updateProfile);
router.get('/stats', driverController.getStats);
router.get('/stats/performance', driverController.getPerformanceStats);
router.get('/route-waypoints', driverController.getRouteWaypoints);
router.get('/resident-locations', driverController.getResidentLocations);
router.get('/notifications', driverController.getNotifications);
router.patch('/notifications/:notification_id/read', driverController.markNotificationRead);
router.get('/online', driverController.getConnectedDrivers);

module.exports = router;