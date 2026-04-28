const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.register = async (req, res) => {
    const { name, email, password, role, phone, address } = req.body;

    // ── Removed admin block so you can register the first admin ──
    // Once your admin account is set up, restore this check:
    // if (role === "admin") {
    //     return res.status(403).json({ message: "Admin registration disabled" });
    // }

    const hashed = await bcrypt.hash(password, 10);

    await db.query(
        `INSERT INTO users (name, email, password, role, phone, address)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, hashed, role || "resident", phone, address]
    );

    res.json({ message: "Registered successfully" });
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    const [rows] = await db.query(
        "SELECT * FROM users WHERE email = ?",
        [email]
    );

    if (rows.length === 0)
        return res.status(400).json({ message: "User not found" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match)
        return res.status(400).json({ message: "Wrong password" });

    const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "1d" }
    );

    res.json({ token, role: user.role });
};