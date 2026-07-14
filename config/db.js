const mysql = require("mysql2");
require('dotenv').config();

// Use consistent variable names from Railway
const dbConfig = {
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'mysql.railway.internal',
    port: parseInt(process.env.MYSQLPORT) || parseInt(process.env.DB_PORT) || 3306,
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000
};

// Add SSL if using Railway
if (process.env.NODE_ENV === 'production') {
    dbConfig.ssl = { rejectUnauthorized: false };
}

// Log connection info (without password)
console.log('📊 Database Config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    database: dbConfig.database,
    ssl: dbConfig.ssl ? 'enabled' : 'disabled'
});

// Create connection pool
const db = mysql.createPool(dbConfig);

// Test connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.log('💡 Check your MySQL credentials in Railway Variables');
        console.log('📝 Required variables: MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE');
    } else {
        console.log('✅ Database connected successfully!');
        console.log(`📊 Connected to: ${dbConfig.database}`);
        connection.release();
    }
});

module.exports = db.promise();