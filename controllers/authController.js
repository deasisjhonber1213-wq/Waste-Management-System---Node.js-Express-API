const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { revokeToken } = require("../middleware/auth");
const { sendOTP } = require("../utils/sms");

const EMAIL_REGEX =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function logAction(userId, action, req) {
    try {
        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, ?, ?)`,
            [userId, action, req.ip || req.connection?.remoteAddress]
        );
    } catch (err) {
        console.error("Audit log error:", err);
    }
}

// REGISTER — auto-verified, phone required
exports.register = async (req, res) => {
    const { name, email, password, role, phone, address } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required" });
    }
    if (!phone) {
        return res.status(400).json({ error: "Phone number is required for SMS password recovery" });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
        const [existing] = await db.query(
            "SELECT id FROM users WHERE email = ?",
            [cleanEmail]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: "Email already registered" });
        }

        const hashed = await bcrypt.hash(password, 10);

        const [result] = await db.query(
            `INSERT INTO users 
             (name, email, password, role, phone, address, email_verified)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [
                name,
                cleanEmail,
                hashed,
                role || "resident",
                phone || null,
                address || null
            ]
        );

        const userId = result.insertId;
        await logAction(userId, "User registered (auto-verified)", req);

        res.status(201).json({
            message: "Account created successfully. You can sign in now.",
            userId,
            email: cleanEmail,
            requiresVerification: false
        });
    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({ error: "Registration failed" });
    }
};

// FORGOT PASSWORD — SMS PIN
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    const generic = {
        message: "If that account exists and has a phone number on file, a PIN was sent by SMS."
    };

    try {
        const [rows] = await db.query(
            "SELECT id, name, email, phone FROM users WHERE email = ?",
            [email.trim().toLowerCase()]
        );

        if (rows.length === 0) {
            return res.json(generic);
        }

        const user = rows[0];

        if (!user.phone) {
            console.warn(`Forgot password: user ${user.id} has no phone number`);
            return res.json(generic);
        }

        const pin = generatePin();
        const expires = new Date(Date.now() + 15 * 60 * 1000);

        await db.query(
            "UPDATE users SET reset_pin = ?, reset_pin_expires = ?, reset_attempts = 0 WHERE id = ?",
            [pin, expires, user.id]
        );

        const smsResult = await sendOTP(user.phone, pin, "reset");

        if (!smsResult.ok) {
            console.error("Forgot password SMS failed:", smsResult.error);
            return res.status(500).json({
                error: "Failed to send reset PIN by SMS. Please try again shortly or contact support."
            });
        }

        await logAction(user.id, "Password reset PIN requested (SMS)", req);
        res.json(generic);
    } catch (err) {
        console.error("Forgot password error:", err);
        res.status(500).json({ error: "Failed to process request" });
    }
};

// RESET PASSWORD
exports.resetPassword = async (req, res) => {
    const { email, pin, newPassword } = req.body;

    if (!email || !pin || !newPassword) {
        return res.status(400).json({ error: "Email, PIN, and new password are required" });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    try {
        const [rows] = await db.query(
            "SELECT id, reset_pin, reset_pin_expires, reset_attempts FROM users WHERE email = ?",
            [email.trim().toLowerCase()]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: "Invalid email or PIN" });
        }

        const user = rows[0];

        if (user.reset_attempts >= 5) {
            return res.status(429).json({ error: "Too many attempts. Request a new PIN." });
        }

        if (!user.reset_pin || !user.reset_pin_expires || new Date(user.reset_pin_expires) < new Date()) {
            return res.status(400).json({ error: "PIN expired or invalid. Request a new one." });
        }

        if (user.reset_pin !== pin.trim()) {
            await db.query("UPDATE users SET reset_attempts = reset_attempts + 1 WHERE id = ?", [user.id]);
            return res.status(400).json({ error: "Invalid PIN" });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await db.query(
            `UPDATE users
             SET password = ?, reset_pin = NULL, reset_pin_expires = NULL, reset_attempts = 0, password_updated_at = NOW()
             WHERE id = ?`,
            [hashed, user.id]
        );

        await logAction(user.id, "Password reset completed", req);

        res.json({ message: "Password updated successfully. You can now sign in." });
    } catch (err) {
        console.error("Reset password error:", err);
        res.status(500).json({ error: "Failed to reset password" });
    }
};

// LOGIN — no email verification check
exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
    }

    try {
        const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);

        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        if (user.locked_at && new Date(user.locked_at) > new Date(Date.now() - 30 * 60000)) {
            return res.status(403).json({
                error: "Account locked",
                message: "Too many failed attempts. Please try again later."
            });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, name: user.name, email: user.email },
            process.env.JWT_SECRET || "secret",
            { expiresIn: "24h" }
        );

        await db.query(
            "UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?",
            [req.ip || req.connection?.remoteAddress, user.id]
        );

        res.json({
            token,
            role: user.role,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({
            error: "Login failed",
            message: process.env.NODE_ENV === "development" ? err.message : "Internal server error"
        });
    }
};

exports.logout = async (req, res) => {
    try {
        if (req.token) revokeToken(req.token);
        await logAction(req.user.id, "User logged out", req);
        res.json({ message: "Logged out successfully" });
    } catch (err) {
        console.error("Logout error:", err);
        res.status(500).json({ error: "Logout failed" });
    }
};

exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current and new password required" });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    try {
        const [rows] = await db.query("SELECT password FROM users WHERE id = ?", [req.user.id]);
        const user = rows[0];
        const match = await bcrypt.compare(currentPassword, user.password);

        if (!match) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await db.query(
            "UPDATE users SET password = ?, password_updated_at = NOW() WHERE id = ?",
            [hashed, req.user.id]
        );

        await logAction(req.user.id, "Password changed", req);

        res.json({ message: "Password changed successfully" });
    } catch (err) {
        console.error("Password change error:", err);
        res.status(500).json({ error: "Password change failed" });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const [[user]] = await db.query(
            "SELECT id, name, email, role, phone, address, last_login FROM users WHERE id=?",
            [req.user.id]
        );
        res.json(user);
    } catch (err) {
        console.error("Get profile error:", err);
        res.status(500).json({ error: "Failed to get profile" });
    }
};

exports.updateProfile = async (req, res) => {
    const { name, phone, address } = req.body;

    try {
        await db.query(
            "UPDATE users SET name=?, phone=?, address=? WHERE id=?",
            [name, phone || null, address || null, req.user.id]
        );

        await logAction(req.user.id, "Profile updated", req);

        res.json({ message: "Profile updated successfully" });
    } catch (err) {
        console.error("Profile update error:", err);
        res.status(500).json({ error: "Profile update failed" });
    }
};

// Stubs so old verify-email routes don't break
exports.verifyEmailPin = async (req, res) => {
    res.json({ message: "Email verification is no longer required. You can sign in." });
};

exports.verifyEmailLink = async (req, res) => {
    res.redirect("/login?verified=1");
};

exports.resendVerification = async (req, res) => {
    res.json({ message: "Email verification is no longer required. You can sign in." });
};