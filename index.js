// ✅ IMPORTS
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs"); // ✅ NEW

// ✅ USSD CODE HELPER
function generateUssdCode(baseCode, userId) {
  return `${baseCode.slice(0, -1)}*${userId}#`;
}

// ✅ INITIALIZE APP
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ DATABASE CONNECTION
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "vendor_portal"
});

db.connect(err => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("Connected to MySQL database.");
  }
});

// ✅ SETUP NODEMAILER
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "Sandipayghana@gmail.com",
    pass: "cbbx wcyj yejj alyd"
  }
});

transporter.verify((error, success) => {
  if (error) console.log("Transporter setup error:", error);
  else console.log("SMTP is ready to send emails.");
});

// ✅ DOWNLOAD COMPLETED ORDERS & RECORD
app.get("/api/download-orders", async (req, res) => {
  const { network, userId } = req.query;
  const sql = `SELECT recipient, volume, network, channel, delivery, payment, timestamp FROM transactions WHERE user_id = ? AND network = ?`;

  db.query(sql, [userId, network], async (err, rows) => {
    if (err || !rows.length) return res.status(500).send("No orders found");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Orders");

    sheet.columns = [
      { header: "Date", key: "timestamp", width: 15 },
      { header: "Recipient", key: "recipient", width: 20 },
      { header: "Quantity", key: "volume", width: 15 },
      { header: "Network", key: "network", width: 15 },
      { header: "Price", key: "price", width: 10 },
      { header: "Payment", key: "payment", width: 10 },
      { header: "Status", key: "delivery", width: 10 },
      { header: "Ref", key: "reference", width: 20 },
      { header: "Platform", key: "platform", width: 10 },
      { header: "Action", key: "action", width: 10 },
    ];

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    rows.forEach(row => {
      sheet.addRow({
        ...row,
        price: 0,
        reference: row.reference || "AUTO_REF" + Math.random().toString().slice(2, 6)
,
        platform: "sandypay",
        action: "completed"
      });

      // insert into downloaded_orders
      db.query(
        `INSERT INTO downloaded_orders (user_id, date, recipient, quantity, network, price, payment, status, updated_reference, platform, action)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, now, row.recipient, row.volume, row.network, 0, row.payment, row.delivery, "AUTO_REF", "sandypay", "completed"]
     
      );
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${network}_orders.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  });
});

// ✅ FETCH DOWNLOADED ORDERS FOR DISPLAY
app.post("/api/downloaded-orders", (req, res) => {
  const { userId } = req.body;
  const sql = `SELECT * FROM downloaded_orders WHERE user_id = ? ORDER BY date DESC`;
  db.query(sql, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch downloaded orders" });
    res.json(rows);
  });
});

// (Leave all other existing routes and logic untouched below this comment)

// ✅ REGISTER
app.post("/api/register", async (req, res) => {
  const { username, phone, sender_id, password, role } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sender_id)) return res.status(400).send("Invalid email format");
  if (password === "0000") return res.status(400).send("PIN cannot be 0000.");

  try {
    db.query("SELECT * FROM users", async (err, users) => {
      if (err) return res.status(500).send("Error checking PINs.");
      for (let user of users) {
        const match = await bcrypt.compare(password, user.password);
        if (match) return res.status(400).send("PIN already in use.");
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const mailOptions = {
        from: "Sandipayghana@gmail.com",
        to: sender_id,
        subject: "Vendor Portal - Email Verification",
        text: `Hi ${username},\n\nWe are verifying this email for your account registration on Vendor Portal.`
      };
      transporter.sendMail(mailOptions, (emailErr) => {
        if (emailErr) return res.status(400).send("Invalid email.");
        db.query("INSERT INTO users (username, phone, sender_id, password, role) VALUES (?, ?, ?, ?, ?)",
          [username, phone, sender_id, hashedPassword, role],
          (insertErr, result) => {
            if (insertErr) return res.status(500).send("Registration failed.");

            const userId = result.insertId;
            const ussdCode = generateUssdCode("*203*555#", userId);

            db.query("UPDATE users SET ussd_code = ? WHERE id = ?", [ussdCode, userId], (updateErr) => {
              if (updateErr) return res.status(500).send("Failed to save USSD code.");
              res.send(`Account created and email sent successfully! Your USSD Code: ${ussdCode}`);
            });
          });
      });
    });
  } catch (err) {
    res.status(500).send("Registration error.");
  }
});



// ✅ LOGIN
app.post("/api/login", (req, res) => {
  const { username, pin, role } = req.body;
  db.query("SELECT * FROM users WHERE username = ? AND role = ? LIMIT 1", [username, role], async (err, results) => {
    if (err) return res.status(500).send("Login failed.");
    if (!results.length) return res.status(401).send("Invalid credentials.");
    const user = results[0];
    const match = await bcrypt.compare(pin, user.password);
    if (!match) return res.status(401).send("Incorrect PIN.");
    res.json({ message: "Login successful", username: user.username, role: user.role, id: user.id });
  });
});

// ✅ CHANGE PIN
app.post("/api/change-pin", async (req, res) => {
  const { userId, oldPin, newPin } = req.body;
  if (newPin === "0000") return res.status(400).send("PIN cannot be 0000.");
  db.query("SELECT password FROM users WHERE id = ?", [userId], async (err, results) => {
    if (err) return res.status(500).send("Server error.");
    if (!results.length) return res.status(400).send("User not found.");
    const user = results[0];
    const match = await bcrypt.compare(oldPin, user.password);
    if (!match) return res.status(400).send("Old PIN incorrect.");
    const hashedNewPin = await bcrypt.hash(newPin, 10);
    db.query("UPDATE users SET password = ? WHERE id = ?", [hashedNewPin, userId], (err) => {
      if (err) return res.status(500).send("Failed to change PIN.");
      res.send("PIN changed successfully!");
    });
  });
});

// ✅ LOAD PRICING
app.post("/api/load-pricing", (req, res) => {
  const { network, userId } = req.body;
  let tableName = "";
  if (network === "mtn") tableName = "pricing_mtn";
  else if (network === "airteltigo") tableName = "pricing_airteltigo";
  else if (network === "telecel") tableName = "pricing_telecel";
  else return res.status(400).send("Invalid network type");
  const sql = `SELECT * FROM ${tableName} WHERE user_id = ?`;
  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).send("Failed to load pricing.");
    res.json(results);
  });
});

// ✅ SAVE PRICING
app.post("/api/save-pricing", (req, res) => {
  const { network, userId, dataPlan, costPrice, sellingPrice } = req.body;
  let tableName = "";
  if (network === "mtn") tableName = "pricing_mtn";
  else if (network === "airteltigo") tableName = "pricing_airteltigo";
  else if (network === "telecel") tableName = "pricing_telecel";
  else return res.status(400).send("Invalid network type");

  const sql = `INSERT INTO ${tableName} (user_id, data_plan, cost_price, selling_price, status)
               VALUES (?, ?, ?, ?, 'available')
               ON DUPLICATE KEY UPDATE selling_price = VALUES(selling_price), status = 'available'`;

  db.query(sql, [userId, dataPlan, costPrice, sellingPrice], (err) => {
    if (err) return res.status(500).send("Failed to save pricing.");
    res.send("Pricing saved.");
  });
});

// ✅ DELETE PRICING
app.post("/api/delete-pricing", (req, res) => {
  const { network, userId, dataPlan } = req.body;
  let tableName = "";
  if (network === "mtn") tableName = "pricing_mtn";
  else if (network === "airteltigo") tableName = "pricing_airteltigo";
  else if (network === "telecel") tableName = "pricing_telecel";
  else return res.status(400).send("Invalid network type");

  const sql = `DELETE FROM ${tableName} WHERE user_id = ? AND data_plan = ?`;
  db.query(sql, [userId, dataPlan], (err) => {
    if (err) return res.status(500).send("Failed to delete pricing.");
    res.send("Pricing deleted.");
  });
});

// ✅ GET USERS
app.get("/api/users", (req, res) => {
  const sql = "SELECT id, username, role, status FROM users";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send("Failed to fetch users.");
    res.json(results);
  });
});

// ✅ DEACTIVATE
app.post("/api/deactivate-user", async (req, res) => {
  const { userId } = req.body;
  const hashedPin = await bcrypt.hash("0000", 10);
  db.query("UPDATE users SET password = ?, status = 'inactive' WHERE id = ?", [hashedPin, userId], (err) => {
    if (err) return res.status(500).send("Failed to deactivate.");
    res.send("User deactivated and PIN reset.");
  });
});

// ✅ REACTIVATE
app.post("/api/reactivate-user", async (req, res) => {
  const { userId, newPin } = req.body;
  if (newPin === "0000") return res.status(400).send("PIN cannot be 0000.");
  const hashedPin = await bcrypt.hash(newPin, 10);
  db.query("UPDATE users SET password = ?, status = 'active' WHERE id = ?", [hashedPin, userId], (err) => {
    if (err) return res.status(500).send("Failed to reactivate.");
    res.send("User reactivated.");
  });
});

// ✅ USER INFO (Updated)
app.post("/api/user-info", (req, res) => {
  const { userId } = req.body;
  db.query(
    "SELECT username, phone, sender_id, ussd_code FROM users WHERE id = ? LIMIT 1",
    [userId],
    (err, results) => {
      if (err) return res.status(500).send("Server error.");
      if (!results.length) return res.status(404).send("User not found.");
      res.json(results[0]);  // includes ussd_code now
    }
  );
});


// ✅ UPDATE SETTINGS
app.post("/api/update-settings", (req, res) => {
  const { userId, username, phone, sender_id } = req.body;
  if (!userId || !username || !phone || !sender_id) return res.status(400).send("All fields required.");
  db.query("UPDATE users SET username = ?, phone = ?, sender_id = ? WHERE id = ?", [username, phone, sender_id, userId], (err) => {
    if (err) return res.status(500).send("Failed to update settings.");
    res.send("Settings updated successfully.");
  });
});

// ✅ RESET PIN
app.post("/api/reset-pin", async (req, res) => {
  const { username, phone, newPin } = req.body;
  if (newPin === "0000") return res.status(400).send("PIN cannot be 0000.");
  const sql = "SELECT id FROM users WHERE username = ? AND phone = ? LIMIT 1";
  db.query(sql, [username, phone], async (err, results) => {
    if (err) return res.status(500).send("Server error.");
    if (!results.length) return res.status(404).send("User not found.");
    const userId = results[0].id;
    const hashedPin = await bcrypt.hash(newPin, 10);
    db.query("UPDATE users SET password = ? WHERE id = ?", [hashedPin, userId], (err) => {
      if (err) return res.status(500).send("Failed to reset PIN.");
      res.send("PIN reset successfully.");
    });
  });
});



app.post("/api/transactions", (req, res) => {
  const { userId } = req.body;
  const sql = "SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1";
  db.query(sql, [userId], (err, result) => {
    if (err) return res.status(500).send("Error fetching transactions");
    res.json(result);
  });
});



// ✅ FALLBACK
app.use((req, res) => {
  res.status(404).send("Endpoint not found");
});

// ✅ START SERVER
app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
