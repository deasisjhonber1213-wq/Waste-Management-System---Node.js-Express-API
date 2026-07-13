const mysql = require("mysql2");
require('dotenv').config();

// Railway automatically provides these variables
const db = mysql.createPool({
    host: process.env.MYSQLHOST || "localhost",
    user: process.env.MYSQLUSER || "root",
    password: process.env.MYSQLPASSWORD || "",
    database: process.env.MYSQLDATABASE || "railway",
    port: parseInt(process.env.MYSQLPORT || "3306"),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    // Railway MySQL needs SSL
    ssl: {
        rejectUnauthorized: false
    }
});

// Test connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('📊 Check your MySQL environment variables');
    } else {
        console.log('✅ Database connected successfully');
        console.log(`📊 Database: ${process.env.MYSQLDATABASE}`);
        console.log(`🔗 Host: ${process.env.MYSQLHOST}`);
        connection.release();
    }
});

module.exports = db.promise();