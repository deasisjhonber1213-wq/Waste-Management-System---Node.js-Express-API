const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/auth");
const controller = require("../controllers/residentController");


router.get("/today-truck", protect, controller.getTodayTruck);
router.get("/pickup-schedule", protect, controller.getPickupSchedule);
router.get("/truck/:truckId/location", protect, controller.getTruckLocation);
router.post("/reports", protect, controller.createReport);
router.get("/announcements", protect, controller.getAnnouncements);

module.exports = router;