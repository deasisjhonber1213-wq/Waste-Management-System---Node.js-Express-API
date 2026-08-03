const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middleware/auth");

// NOTE: merge these with any routes your existing authRoutes.js already had
// (this file only lists what authController.js currently exports).

// ---------- Public ----------
router.post("/register", authController.register);
router.post("/login", authController.login);

// Email verification
router.post("/verify-email", authController.verifyEmailPin);        // { email, pin }
router.get("/verify-email/confirm", authController.verifyEmailLink); // ?token=&email=  (clicked from email)
router.post("/resend-verification", authController.resendVerification); // { email }

// Password recovery
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// ---------- Authenticated ----------
router.post("/logout", protect, authController.logout);
router.post("/change-password", protect, authController.changePassword);
router.get("/profile", protect, authController.getProfile);
router.put("/profile", protect, authController.updateProfile);

module.exports = router;
