const mysql = require("mysql2");
require('dotenv').config();

// Log environment variables for debugging (remove in production)
console.log('📊 Environment Check:');
console.log('MYSQLHOST:', process.env.MYSQLHOST ? '✅ Set' : '❌ Missing');
console.log('MYSQLUSER:', process.env.MYSQLUSER ? '✅ Set' : '❌ Missing');
console.log('MYSQLPASSWORD:', process.env.MYSQLPASSWORD ? '✅ Set' : '❌ Missing');
console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE ? '✅ Set' : '❌ Missing');

// Railway MySQL Configuration
const dbConfig = {
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'mysql.railway.internal',
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway',
    port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306'),
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
console.log('SSL:', dbConfig.ssl ? 'Enabled' : 'Disabled');

const db = mysql.createPool(dbConfig);

// Test connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('📊 Please check:');
        console.error('   1. MySQL service is running in Railway');
        console.error('   2. Environment variables are set correctly');
        console.error('   3. Database name is correct');
    } else {
        console.log('✅ Database connected successfully!');
        console.log(`📊 Connected to: ${dbConfig.database} on ${dbConfig.host}`);
        connection.release();
    }
});

module.exports = db.promise();