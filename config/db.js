const mysql = require("mysql2");
require('dotenv').config();

const databaseUrl = process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL || process.env.DATABASE_URL;
const isRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.MYSQLHOST ||
    process.env.MYSQL_PUBLIC_URL ||
    process.env.MYSQL_URL
);

let dbConfig;

if (databaseUrl) {
    let parsedUrl;
    try {
        parsedUrl = new URL(databaseUrl);
    } catch (err) {
        throw new Error('MYSQL_PUBLIC_URL, MYSQL_URL, or DATABASE_URL must be a valid MySQL connection URL.');
    }

    if (parsedUrl.protocol !== 'mysql:') {
        throw new Error('MYSQL_PUBLIC_URL, MYSQL_URL, or DATABASE_URL must use the mysql:// protocol.');
    }

    dbConfig = {
        host: parsedUrl.hostname,
        port: parsedUrl.port ? Number(parsedUrl.port) : 3306,
        user: decodeURIComponent(parsedUrl.username),
        password: decodeURIComponent(parsedUrl.password),
        database: decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, '')),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 30000,
    };

    if (isRailway) {
        dbConfig.ssl = { rejectUnauthorized: false };
    }
} else {
    const railwayHost = process.env.MYSQLHOST;
    dbConfig = {
        host: railwayHost || process.env.DB_HOST || 'localhost',
        port: Number(railwayHost ? process.env.MYSQLPORT : process.env.DB_PORT) || 3306,
        user: railwayHost ? (process.env.MYSQLUSER || 'root') : (process.env.DB_USER || 'root'),
        password: railwayHost ? (process.env.MYSQLPASSWORD || '') : (process.env.DB_PASSWORD || ''),
        database: railwayHost
            ? (process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'railway')
            : (process.env.DB_NAME || 'wms'),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 30000,
        ...(isRailway ? { ssl: { rejectUnauthorized: false } } : {})
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