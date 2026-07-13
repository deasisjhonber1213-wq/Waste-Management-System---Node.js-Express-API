const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth'); // Import the auth middleware
const driverController = require('../controllers/driverController');

// Apply authentication middleware to ALL driver routes
router.use(protect);

// Debug middleware to log user info
router.use((req, res, next) => {
    console.log('=== Driver Route Debug ===');
    console.log('User ID:', req.user?.id);
    console.log('User Role:', req.user?.role);
    console.log('User Name:', req.user?.name);
    console.log('Request URL:', req.method, req.url);
    next();
});

// Routes
router.get('/today', driverController.getTodayAssignment);
router.get('/schedule', driverController.getMySchedule);
router.patch('/assignment/:id/status', driverController.updateAssignmentStatus);
router.post('/location', driverController.updateMyLocation);
router.post('/reports', driverController.submitReport);
router.get('/reports', driverController.getMyReports);
router.get('/announcements', driverController.getAnnouncements);
router.get('/trips', driverController.getTripHistory);
router.get('/profile', driverController.getProfile);
router.put('/profile', driverController.updateProfile);
router.get('/route-waypoints', driverController.getRouteWaypoints);
router.get('/verify', (req, res) => {
    res.json({
        message: "Auth working",
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role
        }
    });
});

module.exports = router;