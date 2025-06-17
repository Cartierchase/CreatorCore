// api/hookbrain.js
const Redis  = require("ioredis");
let redis;
try {
  redis = new Redis(process.env.REDIS_REST_URL, {
    token: process.env.REDIS_TOKEN,
    tls: {}
  });
} catch {
  redis = null; // skip rate-limits if Redis fails
}

const { OpenAI } = require("openai");
// Configure maxRetriesPerRequest to 2 (default is 20)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetriesPerRequest: 2
});

module.exports = async (req, res) => {
  // 1) CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type,X-User-Plan,X-User-Id");
    return res.status(204).end();
  }
  // 2) Allow CORS
  res.setHeader("Access-Control-Allow-Origin","*");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 3) Validate inputs
    const { niche, tone, goal, topic, postType } = req.body || {};
    if (![niche, tone, goal, topic, postType].every(v => typeof v === "string" && v.trim())) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }

    // 4) Determine plan & dev
    const headerName = process.env.TRUSTED_PLAN_HEADER.toLowerCase();
    const planHeader = req.headers[headerName] || "free";
    const userId     = req.headers["x-user-id"]    || "guest";
    const devList    = (process.env.DEV_USER_IDS||"").split(",");
    const plan       = devList.includes(userId) ? "lifetime" : planHeader;

    // 5) Rate-limit (skip if no Redis or dev)
    if (redis && !devList.includes(userId)) {
      const LIMITS = { free:3, creator:100, pro:500, lifetime:1000 };
      const key   = `u:${userId}:${new Date().toISOString().slice(0,10)}`;
      const cnt   = await redis.incr(key);
      if (cnt === 1) {
        const t = new Date(); t.setUTCDate(t.getUTCDate()+1); t.setUTCHours(0,0,0,0);
        await redis.expire(key, Math.floor((t - new Date())/1000));
      }
      if (cnt > LIMITS[plan]) {
        return res.status(429).json({ error: "Rate limit exceeded" });
      }
    }

    // 6) System prompt
    const system = `
You are a top social media influencer with brand deals and millions of followers.
Create content in the user’s niche, tone, goal, topic, and post type.
Return JSON exactly:
{ "captions":[...], "script":"...", "idea":"...", "seo":[...], "hashtags":[...] }`;
    // 7) OpenAI call
    const chat = await openai.chat.completions.create({
      model: plan === "creator" ? "gpt-3.5-turbo" : "gpt-4-turbo",
      messages: [
        { role:"system", content: system.trim() },
        { role:"user",   content: JSON.stringify({ niche, tone, goal, topic, postType }) }
      ]
    });
    const out = JSON.parse(chat.choices[0].message.content);
    return res.status(200).json(out);

  } catch (err) {
    console.error("hookbrain error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
