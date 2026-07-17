const express = require("express");
const router = express.Router();
const controller = require("../controllers/authController");
const { protect } = require("../middleware/auth");

// Public routes with rate limiting already applied in server.js
router.post("/register", controller.register);
router.post("/login", controller.login);

// Protected routes
router.post("/logout", protect, controller.logout);
router.post("/change-password", protect, controller.changePassword);
router.get("/profile", protect, controller.getProfile);
router.put("/profile", protect, controller.updateProfile);

module.exports = router;