const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const cron = require("node-cron");
const db = require("./config/db");


cron.schedule("0 0 * * 1", async () => {
    await db.query(`
        INSERT INTO announcements (title, message, pickup_date, created_by)
        SELECT 'Weekly Pickup',
               'Garbage pickup scheduled this week',
               CURDATE(),
               id
        FROM users WHERE role = 'admin' LIMIT 1
    `);
});

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));


app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/resident", require("./routes/residentRoutes"));
app.use("/driver/api", require("./routes/driverRoutes"));

app.listen(5000, () =>
    console.log("Server running → http://localhost:5000/login.html")
);