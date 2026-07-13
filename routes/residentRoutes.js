const express = require("express");
const router = express.Router();

// You imported this as "protect"
const { protect } = require("../middleware/auth");
// You imported this as "controller"
const controller = require("../controllers/residentController");

// Existing routes
router.get("/today-truck", protect, controller.getTodayTruck);
router.get("/pickup-schedule", protect, controller.getPickupSchedule);
router.get("/truck/:truckId/location", protect, controller.getTruckLocation);
router.post("/reports", protect, controller.createReport);
router.get("/announcements", protect, controller.getAnnouncements);

// Fixed routes
router.post("/share-location", protect, controller.shareMyLocation);
router.get("/resident-locations", protect, controller.getResidentLocations);
router.get("/mrf-location", protect, controller.getMRFLocation);

// ADD THIS NEW ROUTE
router.get("/route-waypoints", protect, controller.getRouteWaypoints);

module.exports = router;