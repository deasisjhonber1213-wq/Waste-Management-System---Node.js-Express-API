const jwt = require("jsonwebtoken");
const db = require("../config/db");

exports.protect = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");

        const [[user]] = await db.query("SELECT * FROM users WHERE id=?", [decoded.id]);

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = user;
        next();

    } catch (err) {
        res.status(401).json({ message: "Invalid token" });
    }
};

exports.adminOnly = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin only access" });
    }
    next();
};
exports.driverOnly = (req, res, next) => {
    if (req.user.role !== "driver") {
        return res.status(403).json({ message: "Driver only access" });
    }
    next();
};