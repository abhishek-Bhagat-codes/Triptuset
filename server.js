const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "my_secret_key"; // ⚠️ replace with env variable in production

const domain = "http://localhost:3000";
const app = express();
app.use(express.json());

// MySQL connection pool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "te_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// -------------------------
// Haversine Formula
// -------------------------
function getDistanceFromLatLon(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// -------------------------
// Signup API
// -------------------------
app.post("/api/signup", async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      "INSERT INTO users (name, email, password, phone) VALUES (?, ?, ?, ?)",
      [name, email, hashedPassword, phone || null]
    );

    res.json({
      success: true,
      message: "User registered successfully",
      userId: result.insertId,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      res.status(400).json({ error: "Email already registered" });
    } else {
      console.error("DB Error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
});
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" } // token valid for 30 days
    );

    res.json({
      success: true,
      message: "Login successful",
      token: token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------
// Zone Check API
// -------------------------
app.post("/api/check-zone", async (req, res) => {
  const { latitude, longitude, city, state } = req.body;

  if (!latitude || !longitude || !city || !state) {
    return res.status(400).json({
      error: "latitude, longitude, city, and state are required",
    });
  }

  try {
    const [zones] = await pool.query(
      "SELECT * FROM restricted_zone WHERE city = ? OR state = ?",
      [city, state]
    );

    if (zones.length === 0) {
      return res.json({
        restricted: false,
        message: "No restricted zones in this city/state",
      });
    }

    let nearestZone = null;
    let nearestDistance = Infinity;

    for (let zone of zones) {
      const distance = getDistanceFromLatLon(
        latitude,
        longitude,
        zone.latitude,
        zone.longitude
      );

      if (distance <= zone.radius_km) {
        return res.json({
          restricted: true,
          zone: zone.zone_name,
          description: zone.description,
          distance_km: distance.toFixed(2),
        });
      }

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestZone = zone;
      }
    }

    res.json({
      restricted: false,
      message: "Location is safe",
      nearest_zone: nearestZone ? nearestZone.zone_name : null,
      nearest_distance_km: nearestZone ? nearestDistance.toFixed(2) : null,
    });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------
// Start Server
// -------------------------
app.listen(3000, () => {
  console.log("Server running on "+ domain);
});
