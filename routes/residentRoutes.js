const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');


const residentController = require('../controllers/residentController');
console.log('residentController loaded:', Object.keys(residentController));
router.get('/today-truck', auth, residentController.getTodayTruck);
router.get('/route-waypoints', auth, residentController.getRouteWaypoints);
router.get('/truck/:truckId/location', auth, residentController.getTruckLocation);
router.get('/pickup-schedule', auth, residentController.getPickupSchedule);
router.post('/reports', auth, residentController.createReport);
router.get('/reports', auth, residentController.getReports);
router.get('/notifications', auth, residentController.getNotifications);
router.get('/announcements', auth, residentController.getAnnouncements);
router.post('/share-location', auth, residentController.shareMyLocation);
router.get('/resident-locations', auth, residentController.getResidentLocations);
router.get('/mrf-location', auth, residentController.getMRFLocation);

module.exports = router;