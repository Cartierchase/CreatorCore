// api/webhook.js
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_REST_URL, {
  token: process.env.REDIS_TOKEN,
  tls: {}
});

const PRODUCT_PLAN = {
  "creator-core-29":          "creator",
  "creator-core-annual":      "creator",
  "creator-core-pro-trial-99": "pro",
  "creator-core-lifetime":    "lifetime"
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const { product_permalink, purchaser_email } = req.body;
  const slug = product_permalink.split("/l/")[1];
  const plan = PRODUCT_PLAN[slug];
  if (!plan) return res.status(200).end();

  // Store user plan
  await redis.set(`plan:${purchaser_email}`, plan);
  return res.status(200).json({ success: true });
};
