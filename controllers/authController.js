const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { revokeToken } = require("../middleware/auth");
const { sendMail } = require("../utils/mailer");

const APP_URL = (process.env.APP_URL || "http://localhost:5000").replace(/\/$/, "");
const EMAIL_REGEX =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// ===========================================================
// TEMPORARY: email verification is disabled for now.
// - register() marks accounts as verified immediately, skips sending
//   the verification email entirely.
// - login() no longer blocks on email_verified.
// To re-enable later: restore the original register()/login() logic
// (send PIN + link, check email_verified before allowing login).
// ===========================================================

// ---------- Helpers ----------
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

async function logAction(userId, action, req) {
    try {
        await db.query(
            `INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, ?, ?)`,
            [userId, action, req.ip || req.connection.remoteAddress]
        );
    } catch (err) {
        console.error("Audit log error:", err);
    }
}

// ===========================================================
// REGISTER  →  creates an account that is immediately usable.
// (Email verification temporarily disabled — no PIN/link sent.)
// ===========================================================
exports.register = async (req, res) => {
    const { name, email, password, role, phone, address } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required" });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
        // Check if email already exists
        const [existing] = await db.query(
            "SELECT id FROM users WHERE email = ?",
            [cleanEmail]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: "Email already registered" });
        }

        const hashed = await bcrypt.hash(password, 10);

        // ✅ email_verified = 1 immediately — verification disabled for now
        const [result] = await db.query(
            `INSERT INTO users 
             (name, email, password, role, phone, address, email_verified, verify_pin, verify_token, verify_expires)
             VALUES (?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL)`,
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

        await logAction(userId, "User registered", req);

        res.status(201).json({
            message: "Account created. You can now sign in.",
            userId,
            email: cleanEmail,
            requiresVerification: false
        });
    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({ error: "Registration failed" });
    }
};

// ===========================================================
// VERIFY EMAIL — via 6-digit PIN (kept for when verification is re-enabled)
// ===========================================================
exports.verifyEmailPin = async (req, res) => {
    const { email, pin } = req.body;

    if (!email || !pin) {
        return res.status(400).json({ error: "Email and PIN are required" });
    }

    try {
        const [rows] = await db.query(
            "SELECT id, email_verified, verify_pin, verify_expires FROM users WHERE email = ?",
            [email.trim().toLowerCase()]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: "Invalid email or code" });
        }

        const user = rows[0];

        if (user.email_verified) {
            return res.json({ message: "Email already verified. You can sign in." });
        }

        if (!user.verify_pin || !user.verify_expires || new Date(user.verify_expires) < new Date()) {
            return res.status(400).json({ error: "Code expired. Request a new one." });
        }

        if (user.verify_pin !== pin.trim()) {
            return res.status(400).json({ error: "Incorrect code" });
        }

        await db.query(
            `UPDATE users SET email_verified = 1, verify_pin = NULL, verify_token = NULL, verify_expires = NULL WHERE id = ?`,
            [user.id]
        );

        await logAction(user.id, "Email verified", req);

        res.json({ message: "Email verified! You can now sign in." });
    } catch (err) {
        console.error("Verify email error:", err);
        res.status(500).json({ error: "Verification failed" });
    }
};

// ===========================================================
// VERIFY EMAIL — via link click (kept for when verification is re-enabled)
// ===========================================================
exports.verifyEmailLink = async (req, res) => {
    const { token, email } = req.query;

    if (!token || !email) {
        return res.redirect(`/verify-email?error=missing`);
    }

    try {
        const [rows] = await db.query(
            "SELECT id, email_verified, verify_token, verify_expires FROM users WHERE email = ?",
            [String(email).trim().toLowerCase()]
        );

        if (rows.length === 0) {
            return res.redirect(`/verify-email?error=invalid`);
        }

        const user = rows[0];

        if (user.email_verified) {
            return res.redirect(`/verify-email?verified=1`);
        }

        if (!user.verify_token || !user.verify_expires || new Date(user.verify_expires) < new Date()) {
            return res.redirect(`/verify-email?error=expired&email=${encodeURIComponent(email)}`);
        }

        if (user.verify_token !== token) {
            return res.redirect(`/verify-email?error=invalid`);
        }

        await db.query(
            `UPDATE users SET email_verified = 1, verify_pin = NULL, verify_token = NULL, verify_expires = NULL WHERE id = ?`,
            [user.id]
        );

        await logAction(user.id, "Email verified via link", req);

        res.redirect(`/verify-email?verified=1`);
    } catch (err) {
        console.error("Verify link error:", err);
        res.redirect(`/verify-email?error=server`);
    }
};

// ===========================================================
// RESEND VERIFICATION CODE (kept for when verification is re-enabled)
// ===========================================================
exports.resendVerification = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    const generic = { message: "If that account exists and isn't verified yet, a new code was sent." };

    try {
        const [rows] = await db.query(
            "SELECT id, name, email, email_verified FROM users WHERE email = ?",
            [email.trim().toLowerCase()]
        );

        if (rows.length === 0 || rows[0].email_verified) {
            return res.json(generic); // avoid account enumeration
        }

        const user = rows[0];
        const pin = generatePin();
        const token = generateToken();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.query(
            "UPDATE users SET verify_pin = ?, verify_token = ?, verify_expires = ? WHERE id = ?",
            [pin, token, expires, user.id]
        );

        const verifyUrl = `${APP_URL}/api/auth/verify-email/confirm?token=${token}&email=${encodeURIComponent(user.email)}`;

        try {
            await sendMail({
                to: user.email,
                subject: "Your new SmartWaste verification code",
                eyebrow: "Verify your email",
                title: `Hi ${(user.name || "there").split(" ")[0]}, here's your new code`,
                intro: "Enter the code below, or tap the button to verify instantly. It expires in 24 hours.",
                code: pin,
                ctaText: "Verify Email",
                ctaUrl: verifyUrl
            });
        } catch (mailErr) {
            console.error("Resend verification email failed:", mailErr);
        }

        await logAction(user.id, "Verification code resent", req);
        res.json(generic);

    } catch (err) {
        console.error("Resend verification error:", err);
        res.status(500).json({ error: "Failed to resend code" });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    const generic = { message: "If that email exists, a PIN has been sent." };

    try {
        const [rows] = await db.query("SELECT id, name, email FROM users WHERE email = ?", [email.trim().toLowerCase()]);

        if (rows.length === 0) {
            return res.json(generic); // avoid email enumeration
        }

        const user = rows[0];
        const pin = generatePin();
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await db.query(
            "UPDATE users SET reset_pin = ?, reset_pin_expires = ?, reset_attempts = 0 WHERE id = ?",
            [pin, expires, user.id]
        );

        await sendMail({
            to: user.email,
            subject: "SmartWaste – Password Reset PIN",
            eyebrow: "Password reset",
            title: "Reset your password",
            intro: `Hi ${(user.name || "there").split(" ")[0]}, use the code below to set a new password. It expires in 15 minutes.`,
            code: pin
        });

        await logAction(user.id, "Password reset PIN requested", req);

        res.json(generic);
    } catch (err) {
        console.error("Forgot password error:", err);
        res.status(500).json({ error: "Failed to process request" });
    }
};

// ===========================================================
// RESET PASSWORD — verify PIN + set new password
// ===========================================================
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

// ===========================================================
// LOGIN  (email_verified check removed — verification disabled for now)
// ===========================================================
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

        // Email verification check removed for now — accounts are usable immediately.

        const token = jwt.sign(
            { id: user.id, role: user.role, name: user.name, email: user.email },
            process.env.JWT_SECRET || "secret",
            { expiresIn: "24h" }
        );

        await db.query(
            "UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?",
            [req.ip || req.connection.remoteAddress, user.id]
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