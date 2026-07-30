const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { revokeToken } = require("../middleware/auth");

exports.register = async (req, res) => {
    const { name, email, password, role, phone, address } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    try {
        const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: "Email already registered" });
        }

        const hashed = await bcrypt.hash(password, 10);

        const userId = `USER-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        await db.query(
            `INSERT INTO users (id, name, email, password, role, phone, address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, name, email, hashed, role || "resident", phone || null, address || null]
        );

        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) 
             VALUES (?, ?, ?)`,
            [userId, 'User registered', req.ip || req.connection.remoteAddress]
        );

        res.status(201).json({
            message: "Registered successfully",
            userId: userId
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: "Registration failed" });
    }
};
// At top of authController.js (keep your existing requires)
const nodemailer = require("nodemailer");

// ---------- Email transporter ----------
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,      // e.g. your Gmail
        pass: process.env.SMTP_PASS       // App Password
    }
});

// ---------- Helper: generate 6-digit PIN ----------
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ---------- Request reset PIN ----------
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    try {
        const [rows] = await db.query("SELECT id, name, email FROM users WHERE email = ?", [email.toLowerCase()]);

        // Always return success to avoid email enumeration
        if (rows.length === 0) {
            return res.json({ message: "If that email exists, a PIN has been sent." });
        }

        const user = rows[0];
        const pin = generatePin();
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await db.query(
            "UPDATE users SET reset_pin = ?, reset_pin_expires = ?, reset_attempts = 0 WHERE id = ?",
            [pin, expires, user.id]
        );

        // Send email
        await transporter.sendMail({
            from: `"SmartWaste" <${process.env.SMTP_USER}>`,
            to: user.email,
            subject: "SmartWaste – Password Reset PIN",
            html: `
                <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0a120c; color: #e2f5e8; border-radius: 12px;">
                    <h2 style="color: #4ade80; margin: 0 0 12px;">Password Reset</h2>
                    <p style="color: #7aaa88; font-size: 14px; line-height: 1.6;">
                        Hi ${user.name || "there"},<br>
                        Use the PIN below to reset your SmartWaste password. It expires in <strong>15 minutes</strong>.
                    </p>
                    <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #4ade80; text-align: center; padding: 20px; background: rgba(74,222,128,0.1); border-radius: 10px; margin: 20px 0;">
                        ${pin}
                    </div>
                    <p style="color: #7aaa88; font-size: 12px;">
                        If you did not request this, you can safely ignore this email.
                    </p>
                </div>
            `
        });

        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, ?, ?)`,
            [user.id, "Password reset PIN requested", req.ip || req.connection.remoteAddress]
        );

        res.json({ message: "If that email exists, a PIN has been sent." });
    } catch (err) {
        console.error("Forgot password error:", err);
        res.status(500).json({ error: "Failed to process request" });
    }
};

// ---------- Verify PIN + set new password ----------
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
            [email.toLowerCase()]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: "Invalid email or PIN" });
        }

        const user = rows[0];

        // Too many attempts
        if (user.reset_attempts >= 5) {
            return res.status(429).json({ error: "Too many attempts. Request a new PIN." });
        }

        // Expired or missing
        if (!user.reset_pin || !user.reset_pin_expires || new Date(user.reset_pin_expires) < new Date()) {
            return res.status(400).json({ error: "PIN expired or invalid. Request a new one." });
        }

        // Wrong PIN
        if (user.reset_pin !== pin.trim()) {
            await db.query("UPDATE users SET reset_attempts = reset_attempts + 1 WHERE id = ?", [user.id]);
            return res.status(400).json({ error: "Invalid PIN" });
        }

        // Success – update password & clear PIN
        const hashed = await bcrypt.hash(newPassword, 10);
        await db.query(
            `UPDATE users 
             SET password = ?, reset_pin = NULL, reset_pin_expires = NULL, reset_attempts = 0, password_updated_at = NOW()
             WHERE id = ?`,
            [hashed, user.id]
        );

        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, ?, ?)`,
            [user.id, "Password reset completed", req.ip || req.connection.remoteAddress]
        );

        res.json({ message: "Password updated successfully. You can now sign in." });
    } catch (err) {
        console.error("Reset password error:", err);
        res.status(500).json({ error: "Failed to reset password" });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
    }

    try {
        console.log('🔍 Login attempt for email:', email);

        const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
        console.log('📊 Query result rows:', rows.length);

        if (rows.length === 0) {
            console.log('❌ User not found:', email);
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = rows[0];
        console.log('👤 User found:', user.id, user.email, user.role);

        const match = await bcrypt.compare(password, user.password);
        console.log('🔐 Password match:', match);

        if (!match) {
            console.log('❌ Password mismatch for:', email);
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Check if account is locked
        if (user.locked_at && new Date(user.locked_at) > new Date(Date.now() - 30 * 60000)) {
            return res.status(403).json({
                error: "Account locked",
                message: "Too many failed attempts. Please try again later."
            });
        }

        // Generate token
        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                name: user.name,
                email: user.email
            },
            process.env.JWT_SECRET || "secret",
            { expiresIn: "24h" }
        );

        // Update last login
        await db.query(
            "UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?",
            [req.ip || req.connection.remoteAddress, user.id]
        );

        console.log('✅ Login successful for:', email);

        res.json({
            token,
            role: user.role,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error('❌ Login error:', err);
        console.error('Stack trace:', err.stack);
        res.status(500).json({
            error: "Login failed",
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
};

exports.logout = async (req, res) => {
    try {
        if (req.token) {
            revokeToken(req.token);
        }

        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) 
             VALUES (?, ?, ?)`,
            [req.user.id, 'User logged out', req.ip || req.connection.remoteAddress]
        );

        res.json({ message: "Logged out successfully" });
    } catch (err) {
        console.error('Logout error:', err);
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
        const [rows] = await db.query(
            "SELECT password FROM users WHERE id = ?",
            [req.user.id]
        );

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

        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) 
             VALUES (?, ?, ?)`,
            [req.user.id, 'Password changed', req.ip || req.connection.remoteAddress]
        );

        res.json({ message: "Password changed successfully" });
    } catch (err) {
        console.error('Password change error:', err);
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
        console.error('Get profile error:', err);
        res.status(500).json({ error: "Failed to get profile" });
    }
};

exports.updateProfile = async (req, res) => {
    const { name, phone, address } = req.body;

    try {
        await db.query(
            "UPDATE users SET name=?, phone=?, address=? WHERE id=?",
            [name, req.user.phone || null, address || null, req.user.id]
        );

        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) 
             VALUES (?, ?, ?)`,
            [req.user.id, 'Profile updated', req.ip || req.connection.remoteAddress]
        );

        res.json({ message: "Profile updated successfully" });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: "Profile update failed" });
    }
};