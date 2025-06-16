// api/getPlan.js
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_REST_URL, {
  token: process.env.REDIS_TOKEN,
  tls: {}
});

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  const plan = await redis.get(`plan:${email}`);
  res.status(200).json({ plan: plan || "free" });
};
