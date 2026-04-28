const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/adminController");
const { protect, adminOnly } = require("../middleware/auth");

/* =================================================
   HOW THIS ROUTER IS MOUNTED (app.js):

     app.use("/api/admin", adminRouter)   ← API calls from the browser
     app.use("/admin",     adminRouter)   ← HTML page navigation

   OR if mounted at a single path, use the /pages sub-path
   for HTML and the root for API:

     app.use("/api/admin", adminRouter)
     + express.static serves public/admin/*.html directly

   SIMPLEST SETUP (recommended):
   Keep API and static files completely separate.
   In app.js:
     app.use(express.static(path.join(__dirname, "public")));
     app.use("/api/admin", protect, adminOnly, adminRouter);

   Then all routes in this file are pure API — no HTML serving.
   HTML files are served by express.static automatically.
================================================= */

/* =================================================
   ALL ROUTES — auth applied to every request
   Router is mounted at /api/admin so paths here
   are RELATIVE.  Full URL = /api/admin/<path>
================================================= */
router.use(protect, adminOnly);

// Dashboard stats
router.get("/dashboard", ctrl.dashboardStats);

// Users
router.get("/users", ctrl.getUsers);
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

// Analytics
router.get("/analytics", ctrl.reportAnalytics);
router.get("/export-analytics", ctrl.exportAnalytics);

// Announcements
router.get("/announcements", ctrl.getAnnouncements);
router.post("/announcements", ctrl.createAnnouncement);
router.delete("/announcements/:id", ctrl.deleteAnnouncement);

// Profile
router.get("/profile", ctrl.getProfile);
router.put("/profile", ctrl.updateProfile);

module.exports = router;