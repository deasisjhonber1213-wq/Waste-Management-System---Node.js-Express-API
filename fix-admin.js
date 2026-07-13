// reset-admin-password.js
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
require('dotenv').config();

const dbConfig = {
    host: process.env.MYSQLHOST || 'mysql.railway.internal',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || 'BYrNTduIFMPfoZRtCLBzWHKRLFcmUASh',
    database: process.env.MYSQL_DATABASE || 'railway',
    port: parseInt(process.env.MYSQLPORT || '3306'),
    ssl: {
        rejectUnauthorized: false
    }
};

const db = mysql.createConnection(dbConfig);

async function resetPassword() {
    const email = 'admin@smartwaste.com';
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    db.query(
        'UPDATE users SET password = ? WHERE email = ?',
        [hashedPassword, email],
        (err, result) => {
            if (err) {
                console.error('❌ Error resetting password:', err);
            } else if (result.affectedRows === 0) {
                console.log('❌ Admin not found. Creating new admin...');
                // Create admin if doesn't exist
                db.query(
                    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                    ['Admin', email, hashedPassword, 'admin'],
                    (err) => {
                        if (err) {
                            console.error('❌ Error creating admin:', err);
                        } else {
                            console.log('✅ Admin created successfully!');
                            console.log('📧 Email:', email);
                            console.log('🔑 Password:', newPassword);
                        }
                        db.end();
                    }
                );
            } else {
                console.log('✅ Admin password reset successfully!');
                console.log('📧 Email:', email);
                console.log('🔑 Password:', newPassword);
                db.end();
            }
        }
    );
}

resetPassword();