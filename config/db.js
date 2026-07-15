const mysql = require("mysql2");
require('dotenv').config();

const dbConfig = {
    host: process.env.MYSQLHOST || 'mysql.railway.internal',
    port: parseInt(process.env.MYSQLPORT) || 3306,
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'railway', // ← Fixed!
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000
};

if (process.env.NODE_ENV === 'production') {
    dbConfig.ssl = { rejectUnauthorized: false };
}

console.log('📊 Database Config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    database: dbConfig.database,
    ssl: dbConfig.ssl ? 'enabled' : 'disabled'
});

const db = mysql.createPool(dbConfig);

db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.log('💡 Check your MySQL credentials in Railway Variables');
        console.log('📝 Required: MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE');
    } else {
        console.log('✅ Database connected successfully!');
        console.log(`📊 Connected to: ${dbConfig.database}`);
        connection.release();
    }
});

module.exports = db.promise();