// ✅ IMPORTS
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const port = 5050;

// ✅ MIDDLEWARE
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ ROOT PING FOR UPTIMEROBOT
app.get("/", (req, res) => {
  res.send("SandyPay USSD API is live");
});

// ✅ USSD ENDPOINT for MOOLRE
app.post("/ussd/moolre", (req, res) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.set("Content-Type", "text/plain");
      res.send("END Timeout. Please try again.");
    }
  }, 2000); // 2 seconds max wait

  try {
    const text = req.body?.data || req.body?.text || "";
    const phoneNumber = req.body?.msisdn || req.body?.phoneNumber || "";

    console.log("📩 FULL Payload:", req.body);
    console.log("🧾 Parsed:", { text, phoneNumber });

    res.set("Content-Type", "text/plain");

    // Handle first screen
    if (!text || text.trim() === "") {
      clearTimeout(timeout);
      return res.send("CON Welcome to SANDYPAY");
    }

    // Just echo what user typed for now (you can replace this later)
    clearTimeout(timeout);
    return res.send(`END You entered: ${text}`);

  } catch (err) {
    clearTimeout(timeout);
    console.error("❌ Error:", err.message);
    res.set("Content-Type", "text/plain");
    return res.send("END Server error.");
  }
});

// ✅ START SERVER
app.listen(port, () => {
  console.log(`✅ Minimal USSD test server running on http://localhost:${port}`);
});
