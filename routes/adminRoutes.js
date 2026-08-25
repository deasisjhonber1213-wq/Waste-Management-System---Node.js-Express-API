const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/adminController");
const { protect, adminOnly } = require("../middleware/auth");

router.use(protect, adminOnly);

// Dashboard stats
router.get("/dashboard", ctrl.dashboardStats);

// Users
router.get("/users", ctrl.getUsers);
router.get("/users/:id", ctrl.getUserById);
router.put("/users/:id", ctrl.updateUser);
router.delete("/users/:id", ctrl.deleteUser);

// Trucks
router.get("/trucks", ctrl.getTrucks);
router.post("/trucks", ctrl.addTruck);
router.put("/trucks/:id", ctrl.editTruck);
router.delete("/trucks/:id", ctrl.deleteTruck);
router.put("/trucks/:id/location", ctrl.updateTruckLocation);

// Routes / Zones
router.get("/routes", ctrl.getRoutes);
router.post("/routes", ctrl.addRoute);
router.put("/routes/:id", ctrl.updateRoute);
router.delete("/routes/:id", ctrl.deleteRoute);

// Pickup Schedules
router.get("/pickups", ctrl.getPickups);
router.post("/assign-route", ctrl.assignRoute);
router.put("/pickups/:id", ctrl.updatePickup);
router.delete("/pickups/:id", ctrl.deletePickup);

// Reports
router.get("/reports", ctrl.getReports);
router.get("/reports/:id", ctrl.getReportById);
router.put("/reports/:id/status", ctrl.updateReportStatus);
router.delete("/reports/:id", ctrl.deleteReport);

// Analytics
router.get("/analytics", ctrl.reportAnalytics);
router.get("/export-analytics", ctrl.exportAnalytics);

// MRF Locations (NEW - from your controller)
router.get("/mrf-locations", ctrl.getMRFLocations);
router.get("/mrf-locations/:id", ctrl.getMRFLocationById);
router.post("/mrf-locations", ctrl.addMRFLocation);
router.put("/mrf-locations/:id", ctrl.updateMRFLocation);
router.delete("/mrf-locations/:id", ctrl.deleteMRFLocation);

// Announcements
router.get("/announcements", ctrl.getAnnouncements);
router.post("/announcements", ctrl.createAnnouncement);
router.delete("/announcements/:id", ctrl.deleteAnnouncement);

// Resident Locations (for live tracking on admin map)
router.get("/resident-locations", ctrl.getResidentLocations);

// Profile
router.get("/profile", ctrl.getProfile);
router.put("/profile", ctrl.updateProfile);
router.post("/notify-pickup-today", ctrl.notifyPickupToday);

module.exports = router;