const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const port = 5050;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// USSD Test Route
app.post("/ussd/moolre", (req, res) => {
  try {
    const text = req.body?.data || req.body?.text || "";
    const phoneNumber = req.body?.msisdn || req.body?.phoneNumber || "";

    console.log("📩 Incoming USSD:", { text, phoneNumber });

    // Always respond with welcome message
    return res.send("CON Welcome to SANDYPAY");
  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.send("END Something went wrong.");
  }
});

// Start server
app.listen(port, () => console.log(`Minimal USSD test server running on http://localhost:${port}`));
