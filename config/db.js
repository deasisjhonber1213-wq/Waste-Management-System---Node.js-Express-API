const mysql = require("mysql2");
require('dotenv').config();

// Build connection string from environment variables
const connectionString =
    `mysql://${process.env.MYSQLUSER || 'root'}:${process.env.MYSQLPASSWORD || 'BYrNTduIFMPfoZRtCLBzWHKRLFcmUASh'}@${process.env.MYSQLHOST || 'mysql.railway.internal'}:${process.env.MYSQLPORT || '3306'}/${process.env.MYSQL_DATABASE || 'railway'}`;

console.log('📊 Connecting to:', connectionString.replace(/:[^:@]*@/, ':****@'));

const db = mysql.createPool({
    uri: connectionString,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Database connected successfully!');
        console.log(`📊 Connected to: ${process.env.MYSQL_DATABASE || 'railway'}`);
        connection.release();
    }
});

module.exports = db.promise();