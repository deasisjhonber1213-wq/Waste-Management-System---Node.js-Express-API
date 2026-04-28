const bcrypt = require("bcrypt");
const db = require("./config/db"); // adjust path if needed

async function fixAdmin() {
    const plainPassword = "your_admin_password_here"; // whatever you want
    const hashed = await bcrypt.hash(plainPassword, 10);

    await db.query(
        "UPDATE users SET password = ? WHERE role = 'admin'",
        [hashed]
    );

    console.log("Admin password updated successfully!");
    console.log("New hashed password:", hashed);
    process.exit(0);
}

fixAdmin().catch(err => {
    console.error(err);
    process.exit(1);
});