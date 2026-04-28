const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/driverController");
const { protect, driverOnly } = require("../middleware/auth");

router.use(protect, driverOnly);


router.get("/today", ctrl.getTodayAssignment);
router.patch("/assignment/:id/status", ctrl.updateAssignmentStatus);


router.get("/schedule", ctrl.getMySchedule);


router.post("/location", ctrl.updateMyLocation);


router.get("/reports", ctrl.getMyReports);
router.post("/reports", ctrl.submitReport);


router.get("/announcements", ctrl.getAnnouncements);


router.get("/trips", ctrl.getTripHistory);


router.get("/profile", ctrl.getProfile);
router.put("/profile", ctrl.updateProfile);

module.exports = router;