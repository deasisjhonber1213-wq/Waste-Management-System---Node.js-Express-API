// reset-admin-password.js
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
require('dotenv').config();

const email = process.env.ADMIN_EMAIL;
const newPassword = process.env.ADMIN_NEW_PASSWORD;
if (!email || !newPassword || newPassword.length < 8) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_NEW_PASSWORD of at least 8 characters before running this script.');
}

const dbConfig = {
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQLPORT) || 3306,
    ssl: {
        rejectUnauthorized: false
    }
};

if (!dbConfig.host || !dbConfig.password || !dbConfig.database) {
    throw new Error('Set MYSQLHOST, MYSQLPASSWORD, and MYSQLDATABASE before running this script.');
}

const db = mysql.createConnection(dbConfig);

async function resetPassword() {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    db.query(
        'UPDATE users SET password = ? WHERE email = ?',
        [hashedPassword, email],
        (err, result) => {
            if (err) {
                console.error('❌ Error resetting password:', err);
            } else if (result.affectedRows === 0) {
                console.log('❌ Admin not found. Creating new admin...');
                db.query(
                    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                    ['Admin', email, hashedPassword, 'admin'],
                    (err) => {
                        if (err) {
                            console.error('❌ Error creating admin:', err);
                        } else {
                            console.log('✅ Admin created successfully!');
                        }
                        db.end();
                    }
                );
            } else {
                console.log('✅ Admin password reset successfully!');
                db.end();
            }
        }
    );
}

resetPassword();