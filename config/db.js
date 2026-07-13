const mysql = require("mysql2");
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "smartwaste",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Add connection timeout for Render
    connectTimeout: 10000
});

// Test connection on startup
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('Please check your database environment variables.');
    } else {
        console.log('✅ Database connected successfully');
        connection.release();
    }
});

module.exports = db.promise();