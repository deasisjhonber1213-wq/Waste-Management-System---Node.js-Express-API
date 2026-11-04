const jwt = require("jsonwebtoken");
const db = require("../config/db");
const crypto = require("crypto");

// Token blacklist (in production, use Redis)
const tokenBlacklist = new Set();

// Clean blacklist periodically
setInterval(() => {
    tokenBlacklist.clear();
}, 3600000); // Clear every hour

exports.protect = async (req, res, next) => {
    try {
        const [scheme, token, ...extra] = (req.headers.authorization || "").trim().split(/\s+/);

        if (scheme.toLowerCase() !== "bearer" || !token || extra.length) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: "No token provided"
            });
        }

        // Check if token is blacklisted
        if (tokenBlacklist.has(token)) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: "Token has been revoked"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if token is expired (jwt.verify already does this)
        if (Date.now() >= decoded.exp * 1000) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: "Token expired"
            });
        }

        const [[user]] = await db.query(
            "SELECT id, name, email, role, phone, address FROM users WHERE id=?",
            [decoded.id]
        );

        if (!user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: "User not found"
            });
        }

        req.user = user;
        req.token = token;
        req.tokenExpiry = new Date(decoded.exp * 1000);

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Unauthorized',
                message: "Token expired",
                code: 'TOKEN_EXPIRED'
            });
        }

        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Unauthorized',
                message: "Invalid token",
                code: 'INVALID_TOKEN'
            });
        }

        console.error("Authentication middleware error:", err);
        res.status(401).json({
            error: 'Unauthorized',
            message: "Authentication failed"
        });
    }
};

exports.adminOnly = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            error: 'Forbidden',
            message: "Admin access required"
        });
    }
    next();
};

exports.driverOnly = (req, res, next) => {
    if (req.user.role !== "driver") {
        return res.status(403).json({
            error: 'Forbidden',
            message: "Driver access required"
        });
    }
    next();
};

exports.residentOnly = (req, res, next) => {
    if (req.user.role !== "resident") {
        return res.status(403).json({
            error: 'Forbidden',
            message: "Resident access required"
        });
    }
    next();
};

// Token blacklist functions
exports.revokeToken = (token) => {
    tokenBlacklist.add(token);
};

exports.isTokenRevoked = (token) => {
    return tokenBlacklist.has(token);
};

// Generate secure random token for password reset
exports.generateResetToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Generate session ID
exports.generateSessionId = () => {
    return crypto.randomBytes(16).toString('hex');
};