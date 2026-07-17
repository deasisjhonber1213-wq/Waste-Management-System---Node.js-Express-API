const mysql = require("mysql2");
require('dotenv').config();

// Determine if we're running on Railway or locally
const isRailway = process.env.RAILWAY_ENVIRONMENT === 'production' || 
                  process.env.MYSQLHOST === 'mysql-czb0.railway.internal' ||
                  process.env.MYSQLHOST === 'mysql.railway.internal';

let dbConfig;

if (isRailway) {
    // Railway production database
    dbConfig = {
        host: process.env.MYSQLHOST || 'mysql-czb0.railway.internal',
        port: parseInt(process.env.MYSQLPORT) || 3306,
        user: process.env.MYSQLUSER || 'root',
        password: process.env.MYSQLPASSWORD || '',
        database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'railway',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 30000,
        ssl: {
            rejectUnauthorized: false
        }
    };
} else {
    // Local development database (XAMPP)
    dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'wms',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 30000
    };
}

console.log('📊 Database Config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    database: dbConfig.database,
    environment: isRailway ? 'Railway' : 'Local',
    ssl: dbConfig.ssl ? 'enabled' : 'disabled'
});

const db = mysql.createPool(dbConfig);

db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.log('💡 Check your MySQL credentials:');
        console.log(`   Host: ${dbConfig.host}`);
        console.log(`   Database: ${dbConfig.database}`);
        console.log(`   User: ${dbConfig.user}`);
        if (isRailway) {
            console.log('📝 Make sure you have set these Railway variables:');
            console.log('   MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE');
        } else {
            console.log('📝 Make sure XAMPP/MySQL is running locally');
            console.log('   Or set these environment variables: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
        }
    } else {
        console.log('✅ Database connected successfully!');
        console.log(`📊 Connected to: ${dbConfig.database}@${dbConfig.host}`);
        connection.release();
    }
});

module.exports = db.promise();