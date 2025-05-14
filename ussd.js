const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const port = 5050;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ Moolre-Compatible USSD Route
app.post("/ussd/moolre", (req, res) => {
  try {
    const text = req.body?.data || req.body?.text || "";
    const phoneNumber = req.body?.msisdn || req.body?.phoneNumber || "";

    console.log("📩 FULL Moolre Payload:", req.body);
    console.log("🧾 Parsed:", { text, phoneNumber });

    // ✅ Fallback welcome message for first request
    if (!text || text.trim() === "") {
      res.set("Content-Type", "text/plain");
      return res.send("CON Welcome to SANDYPAY");
    }

    // ✅ Optional: Echo back input (for testing)
    res.set("Content-Type", "text/plain");
    return res.send(`END You entered: ${text}`);

  } catch (err) {
    console.error("❌ USSD error:", err.message);
    res.set("Content-Type", "text/plain");
    return res.send("END Something went wrong. Try again.");
  }
});

// ✅ Health-check to keep service warm
app.get("/", (req, res) => {
  res.send("SandyPay USSD API is running.");
});

// ✅ Start server
app.listen(port, () => {
  console.log(`✅ Minimal USSD test server running on http://localhost:${port}`);
});
