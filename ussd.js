// ✅ IMPORTS
const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const base64 = require("base-64");

const app = express();
const port = 5050;

// ✅ MIDDLEWARE
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ DATABASE CONNECTION (RAILWAY)
const db = mysql.createConnection({
  host: "hopper.proxy.rlwy.net",
  user: "root",
  password: "bVaRXYBnYMeeSrnJgxDMacLnUYxxyzhN",
  database: "railway",
  port: 23552
});

db.connect(err => {
  if (err) console.error("❌ Database connection failed:", err);
  else console.log("✅ Connected to Railway MySQL database.");
});

// ✅ THETELLER CONFIG
const merchantId = "TTM-00009388";
const apiUsername = "louis66a20ac942e74";
const apiKey = "Zjg2ZjYxYzc5ODVlZTBkYzg0MWNjNWM5MWNiZjc3YTI=";

// ✅ HELPER: Get network table
function getNetworkTable(networkId) {
  if (networkId === "1") return "pricing_mtn";
  if (networkId === "2") return "pricing_airteltigo";
  if (networkId === "3") return "pricing_telecel";
  return null;
}

// ✅ HELPER: Fetch plans using selling_price
function fetchPlans(table, userId, callback) {
  const sql = `SELECT data_plan, selling_price FROM ${table} WHERE status = 'available' AND user_id = ?`;
  db.query(sql, [userId], (err, rows) => {
    if (err || !rows.length) return callback("END There are no available packages now.");
    let text = "CON Select a package:\n";
    rows.forEach((r, i) => {
      const price = parseFloat(r.selling_price).toFixed(2);
      text += `${i + 1}) ${r.data_plan} @ GHS${price}\n`;
    });
    callback(text.trim());
  });
}

// ✅ HELPER: Send MoMo Prompt (without SMS)
function logTransaction(userId, networkKey, volume, recipient, amount, phoneNumber, callback) {
  const ref = uuidv4().replace(/-/g, '').slice(0, 12);
  const network = networkKey?.toLowerCase();
  const rSwitchMap = {
    mtn: "MTN",
    airteltigo: "TGO",
    telecel: "VDF"
  };
  const rSwitch = rSwitchMap[network];

  if (!rSwitch) {
    console.error("❌ Invalid r-switch. NetworkKey:", networkKey);
    return callback("END Payment failed. Invalid network configuration.");
  }

  const sql = `INSERT INTO transactions (user_id, reference, volume, recipient, network, channel, delivery, payment)
               VALUES (?, ?, ?, ?, ?, 'USSD', 'Pending', 'Pending')`;
  db.query(sql, [userId, ref, volume, recipient, network.toUpperCase()], err => {
    if (err) return callback("END Failed to log transaction.");

    const auth = base64.encode(`${apiUsername}:${apiKey}`);
    const formattedAmount = parseInt(amount).toString().padStart(12, '0');

    const payload = {
      merchant_id: merchantId,
      transaction_id: ref,
      amount: formattedAmount,
      processing_code: "000200",
      "r-switch": rSwitch,
      desc: "Data Purchase",
      subscriber_number: phoneNumber
    };

    console.log("\u{1F4E2} Sending MoMo payload:", payload);

    axios.post("https://test.theteller.net/v1.1/transaction/process", payload, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
        "Cache-Control": "no-cache"
      }
    }).then(() => {
      callback("END Please approve the MoMo prompt to complete payment.");
    }).catch(err => {
      console.error("❌ MoMo API error:", err.response?.data || err.message);
      callback("END Failed to initiate payment. Try again.");
    });
  });
}

// ✅ USSD ENDPOINT (NOW SUPPORTS 'data' AND 'msisdn')
app.post("/api/ussd", (req, res) => {
  try {
    const text = req.body?.data || req.body?.text || "";
    const phoneNumber = req.body?.msisdn || req.body?.phoneNumber || "";

    if (!text) {
      console.error("❌ USSD request received with missing input:", req.body);
      return res.send("END Invalid USSD request. Please try again.");
    }

    if (text.startsWith("*203*555*") && text.endsWith("#")) {
      text = text.replace("*203*555*", "").replace("#", "");
    }

    const input = text.split("*");
    const userId = parseInt(input[0]);
    const steps = input.slice(1);
    const step = steps.join("*");

    if (!userId || isNaN(userId)) return res.send("END Invalid USSD code.");

    if (step === "") {
      return res.send("CON Welcome to SandyPay\n1. Buy for Self\n2. Buy for Others");
    }

    if (step === "1" || step === "2") {
      return res.send("CON Choose Network:\n1. MTN\n2. AirtelTigo\n3. Telecel");
    }

    const isSelf = input[1] === "1";

    if (!isSelf && step.match(/^2\*[123]$/)) {
      return res.send("CON Enter recipient number:");
    }

    if ((isSelf && step.match(/^1\*[123]$/)) || (!isSelf && step.match(/^2\*[123]\*[0-9]{10}$/))) {
      const netId = input[2];
      const table = getNetworkTable(netId);
      if (!table) return res.send("END Invalid network selection.");
      return fetchPlans(table, userId, text => res.send(text));
    }

    if ((isSelf && step.match(/^1\*[123]\*[0-9]+$/)) || (!isSelf && step.match(/^2\*[123]\*[0-9]{10}\*[0-9]+$/))) {
      const netId = input[2];
      const table = getNetworkTable(netId);
      if (!table) return res.send("END Invalid network selection.");
      const planIndex = isSelf ? input[3] : input[4];
      const offset = parseInt(planIndex) - 1;
      const recipient = isSelf ? phoneNumber.slice(-10) : input[3];
      const networkKey = table.replace("pricing_", "").toLowerCase();

      db.query(`SELECT data_plan, selling_price FROM ${table} WHERE user_id = ? AND status = 'available' LIMIT 1 OFFSET ?`, [userId, offset], (err, rows) => {
        if (err || !rows.length) return res.send("END Invalid selection.");
        const { data_plan, selling_price } = rows[0];
        const formattedAmount = parseFloat(selling_price).toFixed(2);
        logTransaction(userId, networkKey, data_plan, recipient, selling_price, recipient, msg => {
          if (!res.headersSent) res.send(`END GHS${formattedAmount} will be deducted from your account.\n${msg}`);
        });
      });
      return;
    }

    return res.send("END Invalid option");
  } catch (err) {
    console.error("❌ USSD error:", err.message);
    return res.send("END Something went wrong. Try again later.");
  }
});

// ✅ START SERVER
app.listen(port, () => console.log(`USSD server running on http://localhost:${port}`));
