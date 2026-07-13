const mysql = require("mysql2");
require('dotenv').config();

// Debug: Log what variables are available
console.log('📊 Checking Environment Variables:');
console.log('MYSQLHOST:', process.env.MYSQLHOST || 'NOT SET');
console.log('MYSQLUSER:', process.env.MYSQLUSER || 'NOT SET');
console.log('MYSQLPASSWORD:', process.env.MYSQLPASSWORD ? '✅ SET' : '❌ NOT SET');
console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE || 'NOT SET');
console.log('MYSQLPORT:', process.env.MYSQLPORT || 'NOT SET');

// Railway MySQL Configuration
const dbConfig = {
    host: process.env.MYSQLHOST || 'mysql.railway.internal',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || 'BYrNTduIFMPfoZRtCLBzWHKRLFcmUASh',
    database: process.env.MYSQLDATABASE || 'railway',
    port: parseInt(process.env.MYSQLPORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    // Enable SSL for Railway
    ssl: {
        rejectUnauthorized: false
    }
};

console.log('📊 Database Config:');
console.log('Host:', dbConfig.host);
console.log('User:', dbConfig.user);
console.log('Database:', dbConfig.database);
console.log('Port:', dbConfig.port);

const db = mysql.createPool(dbConfig);

// Test connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('📊 Please check that ALL variables are set in Railway App Service');
    } else {
        console.log('✅ Database connected successfully!');
        console.log(`📊 Connected to: ${dbConfig.database}`);
        connection.release();
    }
});

module.exports = db.promise();