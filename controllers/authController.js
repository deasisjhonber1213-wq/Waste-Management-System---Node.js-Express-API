const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { revokeToken } = require("../middleware/auth");

exports.register = async (req, res) => {
    const { name, email, password, role, phone, address } = req.body;

    // Input validation
    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    try {
        // Check if user exists
        const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: "Email already registered" });
        }

        const hashed = await bcrypt.hash(password, 10);

        // Generate unique user ID
        const userId = `USER-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        await db.query(
            `INSERT INTO users (id, name, email, password, role, phone, address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, name, email, hashed, role || "resident", phone || null, address || null]
        );

        // Log registration
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

exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
    }

    try {
        const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

        if (rows.length === 0) {
            // Log failed attempt
            await db.query(
                `INSERT INTO audit_logs (user_id, action, ip_address) 
                 VALUES (?, ?, ?)`,
                ['system', `Failed login attempt for ${email}`, req.ip || req.connection.remoteAddress]
            );
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            await db.query(
                `INSERT INTO audit_logs (user_id, action, ip_address) 
                 VALUES (?, ?, ?)`,
                [user.id, `Failed login attempt`, req.ip || req.connection.remoteAddress]
            );
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Check if account is locked
        if (user.locked_at && new Date(user.locked_at) > new Date(Date.now() - 30 * 60000)) {
            return res.status(403).json({
                error: "Account locked",
                message: "Too many failed attempts. Please try again later."
            });
        }

        // Generate token with additional claims
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

        // Log successful login
        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) 
             VALUES (?, ?, ?)`,
            [user.id, 'User logged in', req.ip || req.connection.remoteAddress]
        );

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
        console.error('Login error:', err);
        res.status(500).json({ error: "Login failed" });
    }
};

exports.logout = async (req, res) => {
    try {
        // Revoke the token
        if (req.token) {
            revokeToken(req.token);
        }

        // Log logout
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

        // Log password change
        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) 
             VALUES (?, ?, ?)`,
            [req.user.id, 'Password changed', req.ip || req.connection.remoteAddress]
        );

        // Revoke all existing tokens for this user (optional)
        // This forces re-authentication after password change

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