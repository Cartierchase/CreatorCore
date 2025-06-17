// api/courseforge.js
const Redis  = require("ioredis");
let redis;
try {
  redis = new Redis(process.env.REDIS_REST_URL, {
    token: process.env.REDIS_TOKEN,
    tls: {}
  });
} catch {
  redis = null;
}

const { OpenAI } = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseOptions: { maxRetriesPerRequest: 2 }
});

module.exports = async (req, res) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type,X-User-Plan,X-User-Id");
    return res.status(204).end();
  }
  // Allow CORS
  res.setHeader("Access-Control-Allow-Origin","*");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { topic, audience, format, level } = req.body || {};
  if (![topic,audience,format,level].every(v => typeof v==="string" && v.trim())) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  // Identify plan/dev
  const headerName = process.env.TRUSTED_PLAN_HEADER.toLowerCase();
  const planHeader = req.headers[headerName] || "free";
  const userId     = req.headers["x-user-id"]    || "guest";
  const devList    = (process.env.DEV_USER_IDS||"").split(",");
  const plan       = devList.includes(userId) ? "lifetime" : planHeader;

  // Rate-limiting (skip for dev or if Redis missing)
  if (redis && !devList.includes(userId)) {
    try {
      const LIMITS = { free:3, creator:100, pro:500, lifetime:1000 };
      const key   = `u:${userId}:${new Date().toISOString().slice(0,10)}`;
      const cnt   = await redis.incr(key);
      if (cnt === 1) {
        const t=new Date(); t.setUTCDate(t.getUTCDate()+1); t.setUTCHours(0,0,0,0);
        await redis.expire(key,Math.floor((t-new Date())/1000));
      }
      if (cnt > LIMITS[plan]) {
        return res.status(429).json({ error: "Rate limit exceeded" });
      }
    } catch {}
  }

  // Build system prompt for fully fleshed course
  const system = `
You are a million-dollar life coach who has sold courses worth tens of millions.
Generate a **complete course package** that a customer can upload and sell immediately,
with zero additional work. Include:

1. **Course Title & Subtitle**  
2. **Sales Page Blurb**  
3. **Module & Lesson Breakdown**  
4. **Workbook Exercises** for each lesson  
5. **Downloadable Resource List** (PDFs, templates, checklists)  
6. **Call-to-Action & Next Steps**  

Return a single JSON field "courseMarkdown" containing the entire package in Markdown format.
`.trim();

  try {
    const chat = await openai.chat.completions.create({
      model: plan === "creator" ? "gpt-3.5-turbo" : "gpt-4-turbo",
      messages: [
        { role:"system", content: system },
        { role:"user",   content: JSON.stringify({ topic, audience, format, level }) }
      ]
    });

    const courseMarkdown = chat.choices[0].message.content;
    return res.status(200).json({ courseMarkdown });

  } catch (err) {
    console.error("courseforge error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
