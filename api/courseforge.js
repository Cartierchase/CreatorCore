// api/hookbrain.js
const Redis   = require("ioredis");
const redis   = new Redis(process.env.REDIS_REST_URL, { token: process.env.REDIS_TOKEN, tls:{} });
const OpenAI  = require("openai");
const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LIMITS = { free:3, creator:100, pro:500, lifetime:1000 };
const ALERT  = 0.8;

module.exports = async (req, res) => {
  // 1) CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-User-Plan,X-User-Id");
    return res.status(204).end();
  }
  // 2) Allow CORS on real requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // 3) Identify plan & user
  const headerName = process.env.TRUSTED_PLAN_HEADER.toLowerCase(); // "x-user-plan"
  const planHeader = req.headers[headerName] || "free";
  const userId     = req.headers["x-user-id"] || "guest";

  // 4) Dev-mode bypass
  const devList   = (process.env.DEV_USER_IDS||"").split(",");
  const plan      = devList.includes(userId) ? "lifetime" : planHeader;

  // 5) Rate-limit
  if (!devList.includes(userId)) {
    const limit = LIMITS[plan]||LIMITS.free;
    const key   = `u:${userId}:${new Date().toISOString().slice(0,10)}`;
    const cnt   = await redis.incr(key);
    if (cnt===1) {
      const t=new Date(); t.setUTCDate(t.getUTCDate()+1); t.setUTCHours(0,0,0,0);
      await redis.expire(key, Math.floor((t-new Date())/1000));
    }
    if (cnt > limit) return res.status(429).json({ error: "Rate limit exceeded" });
    if (cnt === Math.floor(limit*ALERT)) {
      console.warn(`User ${userId} at ${ALERT*100}% of ${plan}`);
    }
  }

  // 6) Validate body
  const { niche, tone, goal, topic, postType } = req.body;
  if (!niche||!tone||!goal||!topic||!postType) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // 7) Choose model
  let model = "gpt-4o-mini";
  if (plan==="creator")        model="gpt-3.5-turbo";
  if (plan==="pro"||plan==="lifetime") model="gpt-4-turbo";

  // 8) Call OpenAI
  try {
    const system = `
You are a social media strategist. Return JSON:
{ "captions":[...], "script":"...", "idea":"...", "seo":[...], "hashtags":[...] }`;
    const chat = await openai.chat.completions.create({
      model,
      messages:[
        { role:"system", content: system },
        { role:"user",   content: JSON.stringify({ niche,tone,goal,topic,postType }) }
      ]
    });
    const out = JSON.parse(chat.choices[0].message.content);
    return res.status(200).json(out);
  } catch(err) {
    console.error("hookbrain error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
