// api/courseforge.js
const Redis      = require("ioredis");
const { OpenAI } = require("openai");
const PDFDocument= require("pdfkit");
const getStream  = require("get-stream");

let redis;
try {
  redis = new Redis(process.env.REDIS_REST_URL, {
    token: process.env.REDIS_TOKEN,
    tls: {}
  });
} catch {
  redis = null; // Skip rate limits if Redis fails
}

// Initialize OpenAI with limited retries
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseOptions: { maxRetriesPerRequest: 2 }
});

module.exports = async (req, res) => {
  // ─── CORS PREFLIGHT ─────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-User-Plan,X-User-Id");
    return res.status(204).end();
  }

  // ─── ALLOW CORS ON ACTUAL REQUEST ────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ─── VALIDATE INPUT ──────────────────────────────────────────────────────
  const { topic, audience, format, level } = req.body || {};
  if (![topic,audience,format,level].every(v => typeof v === "string" && v.trim())) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  // ─── IDENTIFY PLAN & DEV ────────────────────────────────────────────────
  const headerName = process.env.TRUSTED_PLAN_HEADER.toLowerCase();      // e.g. "x-user-plan"
  const planHeader = req.headers[headerName] || "free";
  const userId     = req.headers["x-user-id"]      || "guest";
  const devList    = (process.env.DEV_USER_IDS||"").split(",");
  const plan       = devList.includes(userId) ? "lifetime" : planHeader;

  // ─── RATE LIMIT (optional) ──────────────────────────────────────────────
  if (redis && !devList.includes(userId)) {
    try {
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
    } catch (e) {
      console.warn("Redis error, skipping rate limit:", e.message);
    }
  }

  // ─── SYSTEM PROMPT ──────────────────────────────────────────────────────
  const system = `
You are a million-dollar life coach who has sold millions in courses.
Generate a complete, ready-to-sell course package including:
1. Course Title & Subtitle
2. Sales Page Blurb
3. Modules & Lesson Breakdown
4. Workbook Exercises per Lesson
5. Downloadable Resources List
6. Call-to-Action & Next Steps

Return JSON: {
  "courseMarkdown": "...full markdown package here...",
  "pdfBase64": "...base64-encoded PDF..."
}`;
  
  // ─── CALL OPENAI & BUILD PDF ────────────────────────────────────────────
  try {
    const chat = await openai.chat.completions.create({
      model: plan === "creator" ? "gpt-3.5-turbo" : "gpt-4-turbo",
      messages: [
        { role:"system", content: system.trim() },
        { role:"user",   content: JSON.stringify({ topic, audience, format, level }) }
      ]
    });

    const courseMarkdown = chat.choices[0].message.content;

    // Generate PDF using pdfkit
    const doc = new PDFDocument({ margin: 50 });
    doc.fontSize(20).text(topic, { align: "center" }).moveDown();
    doc.fontSize(12).text(courseMarkdown);
    doc.end();
    const pdfBuffer = await getStream.buffer(doc);
    const pdfBase64 = pdfBuffer.toString("base64");

    return res.status(200).json({ courseMarkdown, pdfBase64 });

  } catch (err) {
    console.error("courseforge error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
