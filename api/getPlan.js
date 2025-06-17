// api/getPlan.js
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_REST_URL, { token: process.env.REDIS_TOKEN, tls:{} });

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type");
    return res.status(204).end();
  }
  // Allow CORS
  res.setHeader("Access-Control-Allow-Origin","*");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  try {
    const plan = await redis.get(`plan:${email}`);
    return res.status(200).json({ plan: plan || "free" });
  } catch (err) {
    console.error("getPlan error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
