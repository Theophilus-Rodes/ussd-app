// ✅ IMPORTS
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const port = 5050;

// ✅ MIDDLEWARE
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ HEALTH CHECK ENDPOINT
app.get("/", (req, res) => {
  res.send("SandyPay USSD API is live");
});

// ✅ MOOLRE USSD ENDPOINT
app.post("/ussd/moolre", (req, res) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.set("Content-Type", "text/plain");
      res.send("END Timeout. Please try again.");
    }
  }, 2000); // Safety timeout

  try {
    // Extract input from Moolre payload
    const text = req.body?.data || req.body?.text || "";
    const phoneNumber = req.body?.msisdn?.toString().trim() || "";

    // 🔍 Debug logs
    console.log("📩 FULL Payload:", req.body);
    console.log("🧾 Parsed:", { text, phoneNumber });
    console.log("📞 Raw msisdn:", req.body?.msisdn);
    console.log("📞 Cleaned phoneNumber:", phoneNumber);

    res.set("Content-Type", "text/plain");

    // First screen
    if (!text || text.trim() === "") {
      clearTimeout(timeout);
      return res.send("CON Welcome to SANDYPAY");
    }

    // Echo what was typed
    clearTimeout(timeout);
    return res.send(`END You entered: ${text}`);

  } catch (err) {
    clearTimeout(timeout);
    console.error("❌ USSD error:", err.message);
    res.set("Content-Type", "text/plain");
    return res.send("END Server error. Try again.");
  }
});

// ✅ START SERVER
app.listen(port, () => {
  console.log(`✅ Minimal USSD test server running on http://localhost:${port}`);
});
