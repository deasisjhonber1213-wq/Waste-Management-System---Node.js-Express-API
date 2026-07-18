const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const residentController = require('../controllers/residentController');

console.log('✅ Auth type:', typeof auth);
console.log('✅ Auth methods:', Object.keys(auth));
console.log('✅ Controller loaded:', Object.keys(residentController));

router.get('/today-truck', auth.protect, residentController.getTodayTruck);
router.get('/route-waypoints', auth.protect, residentController.getRouteWaypoints);
router.get('/truck/:truckId/location', auth.protect, residentController.getTruckLocation);

router.get('/pickup-schedule', auth.protect, residentController.getPickupSchedule);

router.post('/reports', auth.protect, residentController.createReport);
router.get('/reports', auth.protect, residentController.getReports);

router.get('/notifications', auth.protect, residentController.getNotifications);
router.get('/announcements', auth.protect, residentController.getAnnouncements);

router.post('/share-location', auth.protect, residentController.shareMyLocation);
router.get('/resident-locations', auth.protect, residentController.getResidentLocations);
router.get('/mrf-location', auth.protect, residentController.getMRFLocation);

// Profile / account management
router.get('/profile', auth.protect, residentController.getProfile);
router.put('/profile', auth.protect, residentController.updateProfile);
router.put('/change-password', auth.protect, residentController.changePassword);

module.exports = router;