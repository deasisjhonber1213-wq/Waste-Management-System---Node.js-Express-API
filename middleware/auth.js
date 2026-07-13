const jwt = require("jsonwebtoken");
const db = require("../config/db");

exports.protect = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        console.log("Auth header:", req.headers.authorization);
        console.log("Token extracted:", token ? "present" : "missing");

        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
        console.log("Decoded token:", decoded);

        const [[user]] = await db.query("SELECT * FROM users WHERE id=?", [decoded.id]);
        console.log("Found user:", user ? { id: user.id, role: user.role, name: user.name } : "none");

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = user;
        console.log("User set in req:", req.user.id, req.user.role);
        next();

    } catch (err) {
        console.error("Auth error:", err.message);
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