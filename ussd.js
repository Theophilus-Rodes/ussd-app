const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const port = 5050;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ USSD ENDPOINT - Moolre-friendly
app.post("/ussd/moolre", (req, res) => {
  try {
    const text = req.body?.data || req.body?.text || "";
    const phoneNumber = req.body?.msisdn || req.body?.phoneNumber || "";

    console.log("📩 FULL Moolre Payload:", req.body);
    console.log("🧾 Parsed:", { text, phoneNumber });

    // ✅ Fallback for empty or first request
    if (!text || text.trim() === "") {
      return res.send("CON Welcome to SANDYPAY");
    }

    // ✅ Echo test (optional)
    return res.send(`END You entered: ${text}`);

  } catch (err) {
    console.error("❌ USSD error:", err.message);
    return res.send("END Something went wrong. Try again.");
  }
});

// ✅ START SERVER
app.listen(port, () => {
  console.log(`✅ Minimal USSD test server running on http://localhost:${port}`);
});
